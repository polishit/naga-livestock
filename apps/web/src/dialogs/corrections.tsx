import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { ApiError, api } from '@/lib/api';
import { Button, Dialog } from '@/components/ui';

interface DialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

/**
 * Delete a record entered by mistake. The server refuses when other records depend on it and says what
 * to do instead (archive or void); that message is shown here so the user knows the next step.
 */
export function DeleteDialog({
  open,
  onOpenChange,
  url,
  what,
  onDeleted,
}: DialogProps & { url: string; what: string; onDeleted?: () => void }) {
  const qc = useQueryClient();
  const [refused, setRefused] = useState('');
  const del = useMutation({
    mutationFn: () => api.delete(url),
    onSuccess: () => {
      toast.success(`${what} deleted.`);
      onOpenChange(false);
      onDeleted?.();
      qc.invalidateQueries();
    },
    onError: (e: unknown) => setRefused(e instanceof ApiError ? e.message : 'Could not delete. Try again.'),
  });
  const close = (o: boolean) => {
    if (!o) setRefused('');
    onOpenChange(o);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={`Delete ${what}?`}
      size="sm"
      guardChanges={false}
      footer={
        <>
          <Button variant="outline" onClick={() => close(false)}>
            {refused ? 'Close' : 'Cancel'}
          </Button>
          {!refused && (
            <Button variant="destructive" loading={del.isPending} onClick={() => del.mutate()}>
              Delete permanently
            </Button>
          )}
        </>
      }
    >
      {refused ? (
        <p
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[14px] text-amber-900"
        >
          {refused}
        </p>
      ) : (
        <div className="space-y-2 text-[15px] text-slate-700">
          <p>
            Use this only for a record <b>entered by mistake</b>. It is removed for good and cannot be brought
            back.
          </p>
          <p className="text-[13px] text-slate-500">
            If other records depend on it (cases, vaccinations, transfers…), the system will not delete it and
            will tell you to archive or void it instead, so no history is lost.
          </p>
        </div>
      )}
    </Dialog>
  );
}
