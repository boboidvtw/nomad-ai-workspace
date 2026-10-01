/**
 * panelRegistry.ts
 * Purpose: Central registry for FloatBall panels.
 */

import type { FC } from 'react';

import BallSizePanel from './panels/BallSizePanel';
import WidthPanel from './panels/WidthPanel';

type FloatBallPanelComponentProps = {
  side: 'left' | 'right';
  onClose: () => void;
};

export type FloatBallPanel = {
  id: string;
  icon?: string;
  labelKey: string;
  component: FC<FloatBallPanelComponentProps>;
};

export const panels: FloatBallPanel[] = [
  {
    id: 'ball-size',
    icon: 'Settings',
    labelKey: 'floatBall.ballSize',
    component: BallSizePanel,
  },
  {
    id: 'width',
    icon: 'ArrowLeftRight',
    labelKey: 'floatBall.width',
    component: WidthPanel,
  },
];
