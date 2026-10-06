export class ApprovalGate {
    /**
     * Submits an in-progress task for operator review
     * @param {import('./dispatcher').TaskDispatcher} dispatcher
     * @param {string} taskId
     * @param {string} agentId
     * @param {Object} [reviewRequest]
     * @param {string} [reviewRequest.proposal]
     * @param {string} [reviewRequest.diff]
     * @returns {import('../result').UnitResult<import('./task-model').Task>}
     */
    static submitForReview(dispatcher: import("./dispatcher").TaskDispatcher, taskId: string, agentId: string, reviewRequest?: {
        proposal?: string | undefined;
        diff?: string | undefined;
    }): import("../result").UnitResult<import("./task-model").Task>;
    /**
     * Records a human operator approval or rejection decision
     * @param {import('./dispatcher').TaskDispatcher} dispatcher
     * @param {string} taskId
     * @param {Object} [decisionInput]
     * @param {'approve' | 'reject'} [decisionInput.decision] - Required; validated at runtime
     * @param {string} [decisionInput.feedback]
     * @param {string} [decisionInput.reviewer='operator']
     * @param {boolean} [decisionInput.completeOnApproval=true]
     * @returns {import('../result').UnitResult<import('./task-model').Task>}
     */
    static decideApproval(dispatcher: import("./dispatcher").TaskDispatcher, taskId: string, decisionInput?: {
        decision?: "approve" | "reject" | undefined;
        feedback?: string | undefined;
        reviewer?: string | undefined;
        completeOnApproval?: boolean | undefined;
    }): import("../result").UnitResult<import("./task-model").Task>;
    /**
     * Lists all tasks pending approval
     * @param {import('./dispatcher').TaskDispatcher} dispatcher
     * @returns {import('./task-model').Task[]}
     */
    static listPendingReviews(dispatcher: import("./dispatcher").TaskDispatcher): import("./task-model").Task[];
}
