import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  AlignmentType,
  TextRun,
} from "npm:docx";

export async function createWordReport(
  title: string,
  body: string,
): Promise<Uint8Array> {

  const doc = new Document({
    sections: [
      {
        children: [

          new Paragraph({
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: title,
                bold: true,
                size: 36,
              }),
            ],
          }),

          new Paragraph({
            children: [
              new TextRun({
                text: body,
                size: 26,
              }),
            ],
          }),

        ],
      },
    ],
  });

  return await Packer.toUint8Array(doc);
}
function markdownToParagraphs(markdown: string) {

  const lines = markdown.split("\n");

  const paragraphs = [];

  for (const line of lines) {

    const text = line.trim();

    if (!text) continue;

    // Heading 1
    if (text.startsWith("# ")) {

      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({
              text: text.substring(2),
              bold: true,
              size: 34,
            }),
          ],
        })
      );

      continue;
    }

    // Heading 2
    if (text.startsWith("## ")) {

      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({
              text: text.substring(3),
              bold: true,
              size: 30,
            }),
          ],
        })
      );

      continue;
    }

    // Heading 3
    if (text.startsWith("### ")) {

      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({
              text: text.substring(4),
              bold: true,
              size: 28,
            }),
          ],
        })
      );

      continue;
    }

    // Bullet
    if (text.startsWith("- ")) {

      paragraphs.push(
        new Paragraph({
          bullet: {
            level: 0,
          },
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({
              text: text.substring(2),
            }),
          ],
        })
      );

      continue;
    }

    // متن عادی

    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({
            text,
          }),
        ],
      })
    );

  }

  return paragraphs;

}