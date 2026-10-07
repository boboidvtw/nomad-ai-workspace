const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { TaskDispatcher } = require('../tasks/dispatcher');
const { RecurringScheduler } = require('../tasks/recurring-scheduler');

describe('Task Control Plane: Task Search & DAG Dependency Graph', () => {
  it('filters tasks by query across title, description and logs', () => {
    const dispatcher = new TaskDispatcher();
    dispatcher.createTask({
      title: 'Refactor Authentication Module',
      description: 'Improve token security',
    });
    dispatcher.createTask({
      title: 'Build Canvas Diff Viewer',
      description: 'Side-by-side Monaco diff',
    });
    dispatcher.createTask({ title: 'Documentation Update', description: 'Update AGENTS.md guide' });

    const authMatches = dispatcher.listTasks({ query: 'authentication' });
    assert.strictEqual(authMatches.length, 1);
    assert.strictEqual(authMatches[0].title, 'Refactor Authentication Module');

    const diffMatches = dispatcher.listTasks({ query: 'monaco' });
    assert.strictEqual(diffMatches.length, 1);
    assert.strictEqual(diffMatches[0].title, 'Build Canvas Diff Viewer');

    const emptyMatches = dispatcher.listTasks({ query: 'nonexistent-keyword' });
    assert.strictEqual(emptyMatches.length, 0);
  });

  it('constructs complete DAG dependency graph with blocking states', () => {
    const dispatcher = new TaskDispatcher();
    const taskA = dispatcher.createTask({ title: 'Setup Database Schema' }).data;
    const taskB = dispatcher.createTask({
      title: 'Implement API Routes',
      dependencies: [taskA.id],
    }).data;
    const taskC = dispatcher.createTask({
      title: 'Deploy to Production',
      dependencies: [taskB.id],
    }).data;

    const graph = dispatcher.getTaskGraph();
    assert.strictEqual(graph.totalCount, 3);
    assert.strictEqual(graph.blockedCount, 2);

    const nodeB = graph.nodes.find((n) => n.id === taskB.id);
    assert.strictEqual(nodeB.isBlocked, true);
    assert.deepStrictEqual(nodeB.unsatisfiedDependencies, [taskA.id]);
    assert.deepStrictEqual(nodeB.downstreamDependentIds, [taskC.id]);

    // Complete task A
    dispatcher.claimTask(taskA.id, 'agent-claude');
    dispatcher.completeTask(taskA.id, 'agent-claude');

    const updatedGraph = dispatcher.getTaskGraph();
    const updatedNodeB = updatedGraph.nodes.find((n) => n.id === taskB.id);
    assert.strictEqual(updatedNodeB.isBlocked, false);
    assert.deepStrictEqual(updatedNodeB.unsatisfiedDependencies, []);
  });
});

describe('Task Control Plane: Recurring & Scheduled Tasks Engine', () => {
  it('manages recurring schedules lifecycle and seeds defaults', () => {
    const tempScheduleFile = path.join(os.tmpdir(), 'nomad-test-schedules-' + Date.now() + '.json');
    const dispatcher = new TaskDispatcher();
    const scheduler = new RecurringScheduler({
      dispatcher,
      storagePath: tempScheduleFile,
      autoPersist: true,
    });

    const loadRes = scheduler.loadFromDisk();
    assert.strictEqual(loadRes.success, true);
    assert.ok(scheduler.listSchedules().length >= 2);

    // Add custom schedule
    const addRes = scheduler.addSchedule({
      name: 'Custom Periodic Test',
      intervalMs: 60000,
      taskTemplate: {
        title: 'Periodic Cleanup Task',
        priority: 'low',
        assignee: 'agent-gemini',
      },
    });
    assert.strictEqual(addRes.success, true);
    const scheduleId = addRes.data.id;

    // Toggle
    scheduler.toggleSchedule(scheduleId, false);
    assert.strictEqual(scheduler.getSchedule(scheduleId).enabled, false);

    scheduler.toggleSchedule(scheduleId, true);
    assert.strictEqual(scheduler.getSchedule(scheduleId).enabled, true);

    // Remove
    const removeRes = scheduler.removeSchedule(scheduleId);
    assert.strictEqual(removeRes.success, true);
    assert.strictEqual(scheduler.getSchedule(scheduleId), null);

    try {
      fs.unlinkSync(tempScheduleFile);
    } catch {}
  });

  it('triggers schedule to create and optionally run task with autoRun', async () => {
    const dispatcher = new TaskDispatcher();
    const scheduler = new RecurringScheduler({
      dispatcher,
      autoPersist: false,
    });

    scheduler.addSchedule({
      id: 'test-auto-trigger',
      name: 'Automated Dispatch Test',
      intervalMs: 10000,
      autoRun: false,
      taskTemplate: {
        title: 'Triggered Worker Job',
        assignee: 'agent-chatgpt',
      },
    });

    const triggerRes = await scheduler.triggerSchedule('test-auto-trigger');
    assert.strictEqual(triggerRes.success, true);
    assert.strictEqual(triggerRes.data.task.title, 'Triggered Worker Job');
    assert.strictEqual(triggerRes.data.schedule.runCount, 1);

    const taskInDispatcher = dispatcher.getTask(triggerRes.data.task.id);
    assert.strictEqual(taskInDispatcher.success, true);
    assert.strictEqual(taskInDispatcher.data.metadata.scheduledName, 'Automated Dispatch Test');
  });
});
