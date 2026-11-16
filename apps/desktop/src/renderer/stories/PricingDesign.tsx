/** A small pricing page, in the design's own light theme. It's 220 pixels wide. */
export function PricingDesign() {
  return (
    <div className="flex w-[220px] flex-col gap-2 bg-white p-3 font-sans text-neutral-900">
      <span className="text-[13px] font-semibold">Pricing</span>
      <div className="grid grid-cols-2 gap-2">
        {[
          ["Starter", "$0"],
          ["Team", "$12"]
        ].map(([name, price], index) => (
          <div
            key={name}
            className={`flex flex-col gap-1 rounded-lg border p-2 ${index === 1 ? "border-neutral-900" : "border-neutral-200"}`}
          >
            <span className="text-[10px] text-neutral-500">{name}</span>
            <span className="text-base font-semibold">{price}</span>
            <span
              className={`mt-1 rounded-md py-1 text-center text-[9px] font-medium ${index === 1 ? "bg-neutral-900 text-white" : "border border-neutral-200"}`}
            >
              {index === 1 ? "Start a trial" : "Start free"}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
