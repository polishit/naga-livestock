import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { FarmDialog, GroupDialog, OwnerDialog, type FarmEditRecord, type OwnerRecord } from './registry';

type Step = 'owner' | 'farm' | 'group';

/**
 * Add Owner: the owner, their farm (pinned on the map) and the livestock on it, one form after another,
 * with Back and Next. Going back edits what was already saved, so nothing is entered twice.
 */
export function RegisterRaiser({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [step, setStep] = useState<Step | null>(null);
  const [ownerId, setOwnerId] = useState(0);
  const [farmId, setFarmId] = useState(0);
  // The saved owner / farm, loaded when the user goes Back so the step opens for editing.
  const [owner, setOwner] = useState<OwnerRecord | null>(null);
  const [farm, setFarm] = useState<FarmEditRecord | null>(null);
  useEffect(() => {
    if (open) {
      setStep('owner');
      setOwnerId(0);
      setFarmId(0);
      setOwner(null);
      setFarm(null);
    } else setStep(null);
  }, [open]);

  // Cancel / X ends the guide; what was already saved stays saved.
  const cancel = (s: Step) => (o: boolean) => {
    if (o || step !== s) return;
    onOpenChange(false);
    if (farmId) toast.success('Owner and farm saved. Add the livestock later from the farm page.');
    else if (ownerId) toast.success('Owner saved. Add the farm later from the owner page.');
  };

  const backToOwner = async () => {
    try {
      const d = await api.get<{ owner: OwnerRecord }>(`/api/owners/${ownerId}`);
      setOwner(d.owner);
    } catch {
      /* offline: the owner step opens empty */
    }
    setStep('owner');
  };
  const backToFarm = async () => {
    try {
      const d = await api.get<{ farm: FarmEditRecord & { owner: { fullName: string } } }>(
        `/api/farms/${farmId}`,
      );
      setFarm({ ...d.farm, ownerName: d.farm.owner.fullName });
    } catch {
      /* offline */
    }
    setStep('farm');
  };

  return (
    <>
      <OwnerDialog
        open={step === 'owner'}
        onOpenChange={cancel('owner')}
        owner={owner ?? undefined}
        step="Step 1 of 3"
        onCreated={(id) => {
          setOwnerId(id);
          setStep('farm');
        }}
      />
      {ownerId > 0 && (
        <FarmDialog
          open={step === 'farm'}
          onOpenChange={cancel('farm')}
          ownerId={ownerId}
          farm={farm ?? undefined}
          step="Step 2 of 3"
          onBack={backToOwner}
          onCreated={(id) => {
            setFarmId(id);
            setStep('group');
          }}
        />
      )}
      {farmId > 0 && (
        <GroupDialog
          open={step === 'group'}
          onOpenChange={cancel('group')}
          farmId={farmId}
          step="Step 3 of 3"
          onBack={backToFarm}
          onCreated={() => {
            onOpenChange(false);
            toast.success('Owner, farm and livestock added to the masterlist.');
          }}
        />
      )}
    </>
  );
}
