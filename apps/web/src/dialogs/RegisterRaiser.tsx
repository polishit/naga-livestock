import { CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Dialog } from '@/components/ui';
import { FarmDialog, GroupDialog, OwnerDialog } from './registry';

type Step = 'owner' | 'farm' | 'group' | 'done';

/**
 * "Register a raiser": the owner, their farm (pinned on the map) and the animals on it, one form after
 * another, so a new raiser is never left half-registered on separate pages.
 */
export function RegisterRaiser({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step | null>(null);
  const [ownerId, setOwnerId] = useState(0);
  const [farmId, setFarmId] = useState(0);
  const [groups, setGroups] = useState(0);
  useEffect(() => {
    if (open) {
      setStep('owner');
      setOwnerId(0);
      setFarmId(0);
      setGroups(0);
    } else setStep(null);
  }, [open]);
  // Closing a step's form (Cancel / X) ends the guide; what was already saved stays saved.
  const closeIf = (s: Step) => (o: boolean) => {
    if (!o && step === s) {
      if (s === 'group' && groups > 0) setStep('done');
      else if (s !== 'owner' && (ownerId || farmId)) setStep('done');
      else onOpenChange(false);
    }
  };
  const go = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };
  return (
    <>
      <OwnerDialog
        open={step === 'owner'}
        onOpenChange={closeIf('owner')}
        step="Step 1 of 3"
        onCreated={(id) => {
          setOwnerId(id);
          setStep('farm');
        }}
      />
      {ownerId > 0 && (
        <FarmDialog
          open={step === 'farm'}
          onOpenChange={closeIf('farm')}
          ownerId={ownerId}
          step="Step 2 of 3"
          onCreated={(id) => {
            setFarmId(id);
            setStep('group');
          }}
        />
      )}
      {farmId > 0 && (
        <GroupDialog
          open={step === 'group'}
          onOpenChange={closeIf('group')}
          farmId={farmId}
          step="Step 3 of 3"
          onCreated={() => {
            setGroups((n) => n + 1);
            setStep('done');
          }}
        />
      )}
      <Dialog
        open={step === 'done'}
        onOpenChange={(o) => !o && onOpenChange(false)}
        title="Raiser registered"
        size="sm"
        guardChanges={false}
        footer={
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        }
      >
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="text-[14.5px] text-slate-700">
            <p>
              Saved: the owner{farmId ? ', the farm' : ''}
              {groups ? ` and ${groups} animal group${groups === 1 ? '' : 's'}` : ''}.
            </p>
            {!farmId && (
              <p className="mt-1 text-slate-500">You can add the farm later from the owner’s page.</p>
            )}
            {farmId > 0 && !groups && (
              <p className="mt-1 text-slate-500">Add the animals (head count) next so the farm is counted.</p>
            )}
          </div>
        </div>
        <div className="mt-4 grid gap-2">
          {farmId > 0 && (
            <Button variant={groups ? 'outline' : 'default'} onClick={() => setStep('group')}>
              {groups ? 'Add another species / group' : 'Add the animals (head count)'}
            </Button>
          )}
          {farmId > 0 && (
            <Button variant="outline" onClick={() => go(`/farms/${farmId}`)}>
              Open the farm profile
            </Button>
          )}
          {!farmId && ownerId > 0 && (
            <Button variant="outline" onClick={() => go(`/owners/${ownerId}`)}>
              Open the owner profile
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => {
              setOwnerId(0);
              setFarmId(0);
              setGroups(0);
              setStep('owner');
            }}
          >
            Register another raiser
          </Button>
        </div>
      </Dialog>
    </>
  );
}