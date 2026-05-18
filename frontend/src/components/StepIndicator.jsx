import React from 'react';
import { Check } from 'lucide-react';

const STEPS = [
  { id: 1, label: 'Template' },
  { id: 2, label: 'Upload' },
  { id: 3, label: 'Process' },
  { id: 4, label: 'Results' },
];

function phaseToStep(phase, workflowStep) {
  if (workflowStep === 'template') return 1;
  switch (phase) {
    case 'idle':
    case 'uploading':
    case 'uploaded':
      return 2;
    case 'running':
      return 3;
    case 'done':
      return 4;
    case 'error':
      return 3;
    default:
      return 2;
  }
}

export default function StepIndicator({ phase, workflowStep }) {
  const activeStep = phaseToStep(phase, workflowStep);

  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((step, index) => {
        const completed = step.id < activeStep;
        const active = step.id === activeStep;

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
                  style={{ width: step.id < activeStep ? '100%' : '0%' }}
                />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
