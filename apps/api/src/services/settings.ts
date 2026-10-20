import type { SettingsInput } from '@livestock/shared';
import { prisma } from '../db';

export const DEFAULT_SETTINGS: SettingsInput = {
  officeName: 'City Veterinary Office',
  cityName: 'Naga City',
  defaultRadiusMeters: 1000,
  populationOverdueDays: 30,
  vaccinationUpcomingDays: 30,
  letterheadLine1: 'Republic of the Philippines',
  letterheadLine2: 'City Government of Naga',
};

export async function getSettings(): Promise<SettingsInput> {
  const rows = await prisma.setting.findMany();
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    try {
      out[r.key] = JSON.parse(r.value);
    } catch {
      out[r.key] = r.value;
    }
  }
  return out as SettingsInput;
}

export async function saveSettings(s: SettingsInput) {
  await prisma.$transaction(
    Object.entries(s).map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        create: { key, value: JSON.stringify(value ?? null) },
        update: { value: JSON.stringify(value ?? null) },
      }),
    ),
  );
}
