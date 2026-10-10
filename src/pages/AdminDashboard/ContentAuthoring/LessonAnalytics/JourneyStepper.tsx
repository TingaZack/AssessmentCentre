// src/pages/AdminDashboard/ContentAuthoring/LessonAnalytics/JourneyStepper.tsx
import React from 'react';
import type { StepState } from './types';

import './LessonAnalytics.css';

const LABELS = ['Watch', 'Quiz', 'Grade', 'Done'];
const STATE_TEXT: Record<StepState, string> = {
    done: 'complete',
    active: 'in progress',
    fail: 'not passed',
    todo: 'not started',
    na: 'not part of this lesson'
};

export const JOURNEY_LEGEND = LABELS.join(', ');

export const JourneyStepper: React.FC<{ steps: StepState[] }> = ({ steps }) => (
    <div
        className="la-journey"
        role="img"
        aria-label={steps.map((s, i) => `${LABELS[i]}: ${STATE_TEXT[s]}`).join('. ')}
    >
        {steps.map((s, i) => (
            <React.Fragment key={LABELS[i]}>
                {i > 0 && <span className={`la-journey__line ${steps[i - 1] === 'done' ? 'is-filled' : ''}`} />}
                <span className={`la-journey__dot is-${s}`} title={`${LABELS[i]}: ${STATE_TEXT[s]}`} />
            </React.Fragment>
        ))}
    </div>
);