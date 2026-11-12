import { ymd } from '../lib/dates';
import { prisma } from '../db';

export interface VisitDue {
  kind: 'INITIAL' | 'FOLLOW_UP';
  due: string;
  lastVisit: string | null;
}

/**
 * The site visit each open case still needs. A site visit is an investigation recorded on the case,
 * or a Farm Visit to the case's own farm that is linked to the case (so the same visit is never
 * entered twice). Not visited yet → the first visit is due from the report date; otherwise the
 * follow-up date set at the last investigation, unless the farm was visited again after it.
 */
export async function siteVisitsDue(): Promise<Map<number, VisitDue | null>> {
  const cases = await prisma.diseaseCase.findMany({
    where: { closedAt: null },
    select: {
      id: true,
      farmId: true,
      reportedAt: true,
      investigations: {
        where: { voidedAt: null },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        select: { date: true, nextVisit: true },
      },
      monitoringVisits: { orderBy: [{ date: 'desc' }, { id: 'desc' }], select: { date: true, farmId: true } },
    },
  });
  const out = new Map<number, VisitDue | null>();
  for (const c of cases) {
    const inv = c.investigations[0];
    const fv = c.monitoringVisits.find((v) => v.farmId === c.farmId);
    if (!inv && !fv) {
      out.set(c.id, { kind: 'INITIAL', due: ymd(c.reportedAt)!, lastVisit: null });
      continue;
    }
    const lastVisit = [ymd(inv?.date), ymd(fv?.date)].filter(Boolean).sort().pop() ?? null;
    if (inv?.nextVisit && !(fv && ymd(fv.date)! > ymd(inv.date)!)) {
      out.set(c.id, { kind: 'FOLLOW_UP', due: ymd(inv.nextVisit)!, lastVisit });
      continue;
    }
    out.set(c.id, null);
  }
  return out;
}
