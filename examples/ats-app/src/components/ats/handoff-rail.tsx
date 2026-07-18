import * as React from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const STAGES = ['Sourced', 'Team Lead', 'Senior TL', 'Finalized'];

// Mirrors the identity-mark rail on the auth screen (components/layout/auth-layout.tsx), but
// live: it reflects the workflow_instance's actual current_state instead of a static "1 lit up"
// illustration. Four stages cover all nine granular states -- SUBMITTED_TO_TL/TL_APPROVED/
// TL_REJECTED are all "at the Team Lead" from a glance-level view; the note under the rail (if
// any) carries the finer-grained state name.
const STAGE_INDEX: Record<string, number> = {
  SOURCED: 0,
  SUBMITTED_TO_TL: 1,
  TL_APPROVED: 1,
  TL_REJECTED: 1,
  SUBMITTED_TO_STL: 2,
  STL_APPROVED: 2,
  STL_REJECTED: 2,
  FINALIZED: 3,
  CLOSED: 3,
};

export function HandoffRail({ currentState }: { currentState: string }) {
  const activeIndex = STAGE_INDEX[currentState] ?? 0;
  const rejected = currentState.endsWith('_REJECTED');
  const complete = currentState === 'CLOSED';

  return (
    <div className="flex items-center">
      {STAGES.map((stage, i) => {
        const isDone = i < activeIndex || (i === activeIndex && complete);
        const isCurrent = i === activeIndex && !complete;
        const isRejectedHere = isCurrent && rejected;

        return (
          <React.Fragment key={stage}>
            <div className="flex flex-col items-center gap-2">
              <div
                className={cn(
                  'flex size-8 items-center justify-center rounded-full border-2 text-xs font-mono',
                  isRejectedHere && 'border-danger bg-danger text-danger-foreground',
                  !isRejectedHere && isDone && 'border-primary bg-primary text-primary-foreground',
                  !isRejectedHere && isCurrent && !isDone && 'border-primary text-primary',
                  !isRejectedHere && !isDone && !isCurrent && 'border-border text-muted-foreground',
                )}
              >
                {isRejectedHere ? (
                  <X className="size-4" />
                ) : isDone ? (
                  <Check className="size-4" />
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={cn(
                  'text-xs',
                  isDone || isCurrent ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {stage}
              </span>
            </div>
            {i < STAGES.length - 1 && (
              <div
                className={cn('mb-5 h-0.5 w-10', i < activeIndex ? 'bg-primary' : 'bg-border')}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
