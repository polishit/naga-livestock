/** The key under the disease map (kept apart from the map so it does not load Leaflet). */
export function DiseaseMapLegend({ farms }: { farms?: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-slate-600">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-white bg-red-600 shadow" />
        Confirmed case
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-dashed border-red-700 bg-red-500/20" />
        Monitoring area
      </span>
      {farms && (
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-3.5 rounded-full bg-emerald-800" />
          Your farm
        </span>
      )}
    </div>
  );
}
