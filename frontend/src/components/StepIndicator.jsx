import React from 'react';
import { Check } from 'lucide-react';

const STEPS = [
  { id: 1, label: 'Upload' },
  { id: 2, label: 'Process' },
  { id: 3, label: 'Results' },
];

function phaseToStep(phase) {
  switch (phase) {
    case 'idle':
    case 'uploading':
    case 'uploaded':
      return 1;
    case 'running':
      return 2;
    case 'done':
    case 'error':
      return 3;
    default:
      return 1;
  }
}

function isCompleted(stepId, phase) {
  if (phase === 'done') return stepId <= 3;
  if (phase === 'running') return stepId === 1;
  if (phase === 'uploaded') return false;
  if (phase === 'error') return stepId === 1;
  return false;
}

export default function StepIndicator({ phase }) {
  const activeStep = phaseToStep(phase);

  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((step, index) => {
        const completed = isCompleted(step.id, phase);
        const active = step.id === activeStep && !completed;
        const upcoming = step.id > activeStep && !completed;

        return (
          <React.Fragment key={step.id}>
            {/* Step circle + label */}
            <div className="flex items-center gap-2.5 flex-shrink-0">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300 ${
                  completed
                    ? 'bg-green-500 text-white'
                    : active
                    ? 'bg-[#1B2A4A] text-white'
                    : 'bg-gray-100 text-gray-400'
                }`}
              >
                {completed ? <Check size={13} strokeWidth={2.5} /> : step.id}
              </div>
              <span
                className={`text-sm font-medium transition-colors duration-300 ${
                  completed
                    ? 'text-green-600'
                    : active
                    ? 'text-[#1B2A4A]'
                    : 'text-gray-400'
                }`}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {index < STEPS.length - 1 && (
              <div className="flex-1 mx-3 h-px relative overflow-hidden" style={{ minWidth: 24 }}>
                <div className="absolute inset-0 bg-gray-200" />
                <div
                  className="absolute inset-y-0 left-0 bg-green-500 transition-all duration-500"
                  style={{
                    width: completed && step.id < activeStep ? '100%' : isCompleted(step.id, phase) ? '100%' : '0%',
                  }}
                />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
