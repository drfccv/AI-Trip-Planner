const tableRow = /^\s*\|.*\|\s*$/;
const tableDivider = /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/;
const imageLine = /^\s*!\[[^\]]*\]\([^\n]+\)\s*$/;

const nextContentLine = (lines: string[], from: number) => {
  let index = from;
  while (index < lines.length && !lines[index].trim()) index += 1;
  return index;
};

export function normalizeMarkdownTables(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const output: string[] = [];
  let index = 0;
  while (index < lines.length) {
    if (
      !tableRow.test(lines[index]) ||
      index + 1 >= lines.length ||
      !tableDivider.test(lines[index + 1])
    ) {
      output.push(lines[index]);
      index += 1;
      continue;
    }
    const table = [lines[index], lines[index + 1]];
    const images: string[] = [];
    index += 2;
    while (index < lines.length) {
      if (tableRow.test(lines[index])) {
        table.push(lines[index]);
        index += 1;
        continue;
      }
      const contentIndex = nextContentLine(lines, index);
      if (
        contentIndex < lines.length &&
        imageLine.test(lines[contentIndex])
      ) {
        const afterImage = nextContentLine(lines, contentIndex + 1);
        if (afterImage < lines.length && tableRow.test(lines[afterImage])) {
          images.push(lines[contentIndex]);
          index = afterImage;
          continue;
        }
      }
      break;
    }
    output.push(...table);
    if (images.length) output.push("", ...images, "");
  }
  return output.join("\n");
}
