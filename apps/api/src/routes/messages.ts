import { Router } from 'express';
import { ownerMessageSchema } from '@livestock/shared';
import { prisma } from '../db';
import { ah, badRequest, idParam, notFound, parse } from '../lib/http';
import { THREAD_TYPES, ownerThread } from '../services/messages';

/**
 * Messages between the office and livestock owners (staff side). Every staff member can read and
 * reply; the owner sees replies as coming from the City Veterinary Office.
 */
export const messagesRouter = Router();

/** Unread messages from owners (for the menu badge). */
messagesRouter.get(
  '/summary',
  ah(async (_req, res) => {
    res.json({ unread: await prisma.ownerMessage.count({ where: { fromOwner: true, readAt: null } }) });
  }),
);

/** Owners with an owner-app login, the latest conversations first. */
messagesRouter.get(
  '/',
  ah(async (_req, res) => {
    const users = await prisma.user.findMany({
      where: { role: 'OWNER', ownerId: { not: null } },
      select: {
        id: true,
        ownerId: true,
        owner: { select: { id: true, code: true, fullName: true, barangay: true, status: true } },
      },
    });
    const ownerIds = users.map((u) => u.ownerId!);
    const [last, unread, lastNotes] = await Promise.all([
      prisma.ownerMessage.groupBy({
        by: ['ownerId'],
        where: { ownerId: { in: ownerIds } },
        _max: { id: true },
      }),
      prisma.ownerMessage.groupBy({
        by: ['ownerId'],
        where: { ownerId: { in: ownerIds }, fromOwner: true, readAt: null },
        _count: true,
      }),
      prisma.notification.groupBy({
        by: ['userId'],
        where: { userId: { in: users.map((u) => u.id) }, type: { in: THREAD_TYPES } },
        _max: { createdAt: true },
      }),
    ]);
    const lastMsgs = new Map(
      (
        await prisma.ownerMessage.findMany({
          where: { id: { in: last.map((l) => l._max.id!).filter(Boolean) } },
        })
      ).map((m) => [m.ownerId, m]),
    );
    const rows = users
      .filter((u) => u.owner)
      .map((u) => {
        const m = lastMsgs.get(u.ownerId!);
        const n = lastNotes.find((x) => x.userId === u.id)?._max.createdAt ?? null;
        const at = [m?.createdAt, n]
          .filter((x): x is Date => !!x)
          .sort((a, b) => b.getTime() - a.getTime())[0];
        return {
          ownerId: u.ownerId!,
          code: u.owner!.code,
          fullName: u.owner!.fullName,
          barangay: u.owner!.barangay,
          status: u.owner!.status,
          lastAt: at ?? null,
          last: m ? { fromOwner: m.fromOwner, text: m.text || 'Photo', at: m.createdAt } : null,
          unread: unread.find((x) => x.ownerId === u.ownerId)?._count ?? 0,
        };
      })
      .sort(
        (a, b) =>
          b.unread - a.unread ||
          (b.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0) ||
          a.fullName.localeCompare(b.fullName),
      );
    res.json(rows);
  }),
);

messagesRouter.get(
  '/:ownerId',
  ah(async (req, res) => {
    const ownerId = idParam(req, 'ownerId');
    const owner = await prisma.owner.findUnique({
      where: { id: ownerId },
      select: {
        id: true,
        code: true,
        fullName: true,
        barangay: true,
        contact: true,
        status: true,
        account: { select: { id: true, lastLoginAt: true } },
      },
    });
    if (!owner) throw notFound('Owner');
    const items = await ownerThread(ownerId, 'staff');
    await prisma.ownerMessage.updateMany({
      where: { ownerId, fromOwner: true, readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ owner, items });
  }),
);

messagesRouter.post(
  '/:ownerId',
  ah(async (req, res) => {
    const ownerId = idParam(req, 'ownerId');
    const d = parse(ownerMessageSchema, req.body);
    const owner = await prisma.owner.findUnique({ where: { id: ownerId }, include: { account: true } });
    if (!owner) throw notFound('Owner');
    if (!owner.account)
      throw badRequest(`${owner.fullName} has no owner-app login, so they cannot read messages.`);
    const m = await prisma.ownerMessage.create({
      data: {
        ownerId,
        fromOwner: false,
        byName: req.user!.name,
        byUserId: req.user!.id,
        text: d.text,
        photoKeys: d.photoKeys,
      },
    });
    res.status(201).json(m);
  }),
);
