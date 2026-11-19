const packages = ["經濟包", "量販盒"];
const packageSuffix = /(?:經濟包|量販盒)$/u;
const formulaSuffix = /([一二兩三四五六七八九1-9])合[一1]$/u;
const formulaOrder = "一二三四五六七八九";
const separators = /[\s・·－—–_-]+$/u;

function describeVariant(name: string) {
  const normalized = name.normalize("NFKC").trim();
  const packageIndex = packages.findIndex((pack) => normalized.endsWith(pack));
  const beforePackage = normalized.replace(packageSuffix, "").replace(separators, "");
  const formula = beforePackage.match(formulaSuffix);
  const digit = formula?.[1];
  const series = beforePackage.replace(formulaSuffix, "").replace(separators, "");
  return {
    series: series || normalized,
    pack: packageIndex < 0 ? packages.length : packageIndex,
    formula: digit ? Number(digit) || formulaOrder.indexOf(digit === "兩" ? "二" : digit) + 1 : Infinity,
  };
}

/** Keep series in catalogue order, with packages and then formulas within each series. */
export function sortInstantSeries<T>(items: readonly T[], getName: (item: T) => string): T[] {
  const groups = new Map<string, { item: T; pack: number; formula: number }[]>();
  for (const item of items) {
    const { series, pack, formula } = describeVariant(getName(item));
    const group = groups.get(series) ?? [];
    group.push({ item, pack, formula });
    groups.set(series, group);
  }
  return Array.from(groups.values()).flatMap((group) =>
    group.sort((a, b) => a.pack - b.pack || a.formula - b.formula).map(({ item }) => item),
  );
}
