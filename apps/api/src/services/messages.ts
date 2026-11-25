import { POP_REASON_LABELS, SERVICE_TYPE_LABELS, type PopReason } from '@livestock/shared';
import { prisma } from '../db';

/**
 * The Messages thread of one livestock owner, as both sides see it: the messages they wrote to each
 * other, and the owner's transactions with the office (what the owner sent, and what the office
 * decided) in date order. Disease alerts and announcements are not part of it: they have their own
 * places (the disease map and the home screen).
 */

/** Notification types that belong in the thread (the office's answers to the owner's transactions). */
export const THREAD_TYPES = ['REGISTRATION', 'POPULATION', 'REPORT', 'VACCINATION', 'SERVICE'];

export type ThreadItem =
  | {
      kind: 'message';
      id: number;
      at: Date;
      fromOwner: boolean;
      by: string;
      text: string;
      photos: { key: string; url: string }[];
      read: boolean;
    }
  | {
      kind: 'event';
      key: string;
      at: Date;
      /** Who acted: the owner sent something, or the office answered */
      side: 'owner' | 'office';
      title: string;
      body?: string | null;
      link?: string | null;
    };

export async function ownerThread(
  ownerId: number,
  view: 'owner' | 'staff',
  limit = 300,
): Promise<ThreadItem[]> {
  const files = view === 'owner' ? '/api/my/files/' : '/api/files/';
  const account = await prisma.user.findFirst({ where: { ownerId, role: 'OWNER' }, select: { id: true } });
  const [messages, notes, regs, pops, reports, services, vaccs, signups] = await Promise.all([
    prisma.ownerMessage.findMany({ where: { ownerId }, orderBy: { id: 'desc' }, take: limit }),
    account
      ? prisma.notification.findMany({
          where: { userId: account.id, type: { in: THREAD_TYPES } },
          orderBy: { id: 'desc' },
          take: limit,
        })
      : [],
    prisma.farmRegistration.findMany({ where: { ownerId }, orderBy: { id: 'desc' }, take: 50 }),
    prisma.populationRequest.findMany({ where: { ownerId }, orderBy: { id: 'desc' }, take: 50 }),
    prisma.diseaseReport.findMany({ where: { ownerId }, orderBy: { id: 'desc' }, take: 50 }),
    prisma.serviceRequest.findMany({ where: { ownerId }, orderBy: { id: 'desc' }, take: 50 }),
    prisma.ownerVaccination.findMany({ where: { ownerId }, orderBy: { id: 'desc' }, take: 50 }),
    prisma.activitySignup.findMany({
      where: { ownerId },
      orderBy: { id: 'desc' },
      take: 50,
      include: { activity: { select: { title: true } } },
    }),
  ]);
  const farmIds = [...new Set([...pops, ...reports, ...services, ...vaccs].map((x) => x.farmId))];
  const farms = new Map(
    (await prisma.farm.findMany({ where: { id: { in: farmIds } }, select: { id: true, name: true } })).map(
      (f) => [f.id, f.name],
    ),
  );
  const staff = view === 'staff';
  const out: ThreadItem[] = [];
  for (const m of messages)
    out.push({
      kind: 'message',
      id: m.id,
      at: m.createdAt,
      fromOwner: m.fromOwner,
      by: m.fromOwner ? m.byName : staff ? m.byName : 'City Veterinary Office',
      text: m.text,
      photos: ((m.photoKeys as string[] | null) ?? []).map((k) => ({ key: k, url: `${files}${k}` })),
      read: !!m.readAt,
    });
  // What the office answered (the same notice the owner got).
  for (const n of notes)
    out.push({
      kind: 'event',
      key: `n${n.id}`,
      at: n.createdAt,
      side: 'office',
      title: n.title,
      body: n.body,
      link: staff ? null : n.link,
    });
  // What the owner sent.
  const sent = (key: string, at: Date, title: string, ownerLink: string, staffLink: string, body?: string) =>
    out.push({ kind: 'event', key, at, side: 'owner', title, body, link: staff ? staffLink : ownerLink });
  for (const r of regs)
    sent(
      `reg${r.id}`,
      r.submittedAt,
      `Farm registration sent: ${r.name} (${r.code})`,
      r.farmId ? `/app/farms/${r.farmId}` : `/app/farms`,
      `/farms?pending=${r.id}`,
    );
  for (const p of pops)
    sent(
      `pop${p.id}`,
      p.createdAt,
      `Head count update: ${p.species} ${p.before} → ${p.after}`,
      `/app/farms/${p.farmId}`,
      `/population?pending=${p.id}`,
      `${POP_REASON_LABELS[p.reason as PopReason] ?? p.reason} · ${farms.get(p.farmId) ?? ''}`,
    );
  for (const r of reports)
    sent(
      `rpt${r.id}`,
      r.createdAt,
      `Disease report sent: ${r.code}`,
      `/app/reports/${r.id}`,
      `/cases?pending=${r.id}`,
      `${r.affected} ${r.species} sick${r.deaths ? `, ${r.deaths} dead` : ''} · ${farms.get(r.farmId) ?? ''}`,
    );
  for (const s of services)
    sent(
      `srq${s.id}`,
      s.createdAt,
      `Service requested: ${SERVICE_TYPE_LABELS[s.serviceType as keyof typeof SERVICE_TYPE_LABELS] ?? s.serviceType} (${s.code})`,
      '/app/vaccination',
      `/vaccination-schedule?pending=${s.id}`,
      farms.get(s.farmId) ?? undefined,
    );
  for (const v of vaccs)
    sent(
      `ovx${v.id}`,
      v.createdAt,
      `Vaccination record sent: ${v.vaccine}`,
      '/app/vaccination',
      `/farms/${v.farmId}`,
      `${v.heads} ${v.species} · ${farms.get(v.farmId) ?? ''}`,
    );
  for (const s of signups)
    sent(
      `sgn${s.id}`,
      s.createdAt,
      `Signed up for ${s.activity.title}`,
      '/app/vaccination',
      `/vaccination-schedule?activity=${s.activityId}`,
      `${s.heads} ${s.species}`,
    );
  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(-limit);
}
