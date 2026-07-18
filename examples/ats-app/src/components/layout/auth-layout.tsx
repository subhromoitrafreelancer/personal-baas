import * as React from 'react';
import { Briefcase } from 'lucide-react';

const STAGES = ['Sourced', 'Team Lead', 'Senior TL', 'Finalized'];

// The "handoff rail" -- the one signature element carried across this app: a candidate's
// progress is a literal chain of custody between people (recruiter -> TL -> STL -> BDE), not an
// abstract percentage. A static, lit-up version of the same rail used on the application detail
// screen (Phase 4) doubles as the auth screen's identity mark.
function HandoffRail() {
  return (
    <div className="flex items-center">
      {STAGES.map((stage, i) => (
        <React.Fragment key={stage}>
          <div className="flex flex-col items-center gap-2">
            <div
              className={
                'flex size-8 items-center justify-center rounded-full border-2 border-primary-foreground text-xs font-mono ' +
                (i === 0 ? 'bg-primary-foreground text-primary' : 'text-primary-foreground')
              }
            >
              {i + 1}
            </div>
            <span className="text-xs text-primary-foreground/70">{stage}</span>
          </div>
          {i < STAGES.length - 1 && <div className="mb-5 h-0.5 w-10 bg-primary-foreground/30" />}
        </React.Fragment>
      ))}
    </div>
  );
}

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2">
          <Briefcase className="size-6" />
          <span className="font-display text-xl font-medium">ATS</span>
        </div>
        <div>
          <p className="font-display text-4xl font-medium leading-tight">
            Every candidate,
            <br />a documented handoff.
          </p>
          <p className="mt-4 max-w-sm text-primary-foreground/80">
            From sourcing to sign-off, each stage of the pipeline records who moved a candidate
            forward, and why.
          </p>
        </div>
        <HandoffRail />
      </div>
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
