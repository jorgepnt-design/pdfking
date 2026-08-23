import {
  Combine,
  EyeOff,
  FileOutput,
  FileScan,
  FileSignature,
  Files,
  FormInput,
  Images,
  LayoutGrid,
  Lock,
  Minimize2,
  PenLine,
  Scissors,
  Stamp,
  Unlock,
  type LucideIcon,
} from "lucide-react";
import type { PrivacyMode, ToolCategory } from "@/lib/types";

export interface ToolDefinition {
  id: string;
  title: string;
  description: string;
  category: ToolCategory;
  href: string;
  icon: LucideIcon;
  privacy: PrivacyMode;
}

export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  bearbeiten: "Bearbeiten",
  organisieren: "Organisieren",
  optimieren: "Verkleinern & Optimieren",
  konvertieren: "Konvertieren",
  unterschreiben: "Unterschreiben",
  sicherheit: "Sicherheit",
};

export const CATEGORY_ORDER: ToolCategory[] = [
  "bearbeiten",
  "organisieren",
  "optimieren",
  "konvertieren",
  "unterschreiben",
  "sicherheit",
];

export const TOOLS: ToolDefinition[] = [
  {
    id: "editor",
    title: "PDF bearbeiten",
    description:
      "Texte, Bilder, Formen und Zeichnungen einfügen – mit Vorschau, Undo/Redo und Export.",
    category: "bearbeiten",
    href: "/tools/bearbeiten",
    icon: PenLine,
    privacy: "local",
  },
  {
    id: "organize",
    title: "Seiten organisieren",
    description:
      "Seiten drehen, löschen, duplizieren, neu sortieren, extrahieren oder Leerseiten einfügen.",
    category: "organisieren",
    href: "/tools/organisieren?tab=sortieren",
    icon: LayoutGrid,
    privacy: "local",
  },
  {
    id: "merge",
    title: "PDF zusammenfügen",
    description: "Mehrere PDF-Dateien in der gewünschten Reihenfolge zu einem Dokument verbinden.",
    category: "organisieren",
    href: "/tools/organisieren?tab=zusammenfuegen",
    icon: Combine,
    privacy: "local",
  },
  {
    id: "split",
    title: "PDF aufteilen",
    description: "Ein Dokument per Seitenbereichen in mehrere Dateien zerlegen.",
    category: "organisieren",
    href: "/tools/organisieren?tab=aufteilen",
    icon: Scissors,
    privacy: "local",
  },
  {
    id: "numbers-header",
    title: "Seitenzahlen & Kopf-/Fußzeilen",
    description: "Seitenzahlen einfügen oder Kopf- und Fußzeilen mit eigenem Text ergänzen.",
    category: "organisieren",
    href: "/tools/seitenzahlen",
    icon: Files,
    privacy: "local",
  },
  {
    id: "watermark",
    title: "Wasserzeichen",
    description: "Text-Wasserzeichen mit Farbe, Winkel und Deckkraft über alle Seiten legen.",
    category: "organisieren",
    href: "/tools/wasserzeichen",
    icon: Stamp,
    privacy: "local",
  },
  {
    id: "compress",
    title: "PDF verkleinern",
    description: "Komprimierungsstufen wählen – mit echter Größenanzeige vor dem Download.",
    category: "optimieren",
    href: "/tools/komprimieren",
    icon: Minimize2,
    privacy: "local",
  },
  {
    id: "convert",
    title: "PDF konvertieren",
    description: "Zu Bildern, Text, HTML oder DOCX – sowie Bilder zurück zu PDF.",
    category: "konvertieren",
    href: "/tools/konvertieren",
    icon: FileOutput,
    privacy: "mixed",
  },
  {
    id: "signatures",
    title: "Unterschreiben",
    description:
      "Unterschrift zeichnen, hochladen oder aus dem Namen erzeugen – verschlüsselt gespeichert.",
    category: "unterschreiben",
    href: "/tools/unterschreiben",
    icon: FileSignature,
    privacy: "local",
  },
  {
    id: "metadata",
    title: "Metadaten & Infos",
    description: "Dokumentinformationen anzeigen und bearbeiten, Metadaten entfernen.",
    category: "sicherheit",
    href: "/tools/sicherheit?tab=metadaten",
    icon: FileScan,
    privacy: "local",
  },
  {
    id: "encrypt",
    title: "Mit Passwort schützen",
    description:
      "PDF verschlüsseln (AES-256) und Berechtigungen wie Drucken oder Kopieren steuern.",
    category: "sicherheit",
    href: "/tools/sicherheit?tab=verschluesseln",
    icon: Lock,
    privacy: "local",
  },
  {
    id: "unlock",
    title: "Passwort entfernen",
    description: "Passwortschutz aufheben – nach Eingabe des korrekten Passworts.",
    category: "sicherheit",
    href: "/tools/sicherheit?tab=entsperren",
    icon: Unlock,
    privacy: "local",
  },
  {
    id: "redact",
    title: "Schwärzen",
    description: "Sensible Bereiche dauerhaft entfernen – nicht nur überdecken.",
    category: "sicherheit",
    href: "/tools/sicherheit?tab=schwaerzen",
    icon: EyeOff,
    privacy: "local",
  },
  {
    id: "forms",
    title: "Formulare ausfüllen",
    description: "Formularfelder automatisch erkennen und direkt im Browser ausfüllen.",
    category: "sicherheit",
    href: "/tools/formulare",
    icon: FormInput,
    privacy: "local",
  },
  {
    id: "ocr",
    title: "OCR / Durchsuchbar machen",
    description:
      "Text in gescannten PDFs erkennen – lokal per WebAssembly, deutsche Sprache unterstützt.",
    category: "konvertieren",
    href: "/tools/ocr",
    icon: Images,
    privacy: "local",
  },
];

export function toolsByCategory(): Array<{ category: ToolCategory; tools: ToolDefinition[] }> {
  return CATEGORY_ORDER.map((category) => ({
    category,
    tools: TOOLS.filter((tool) => tool.category === category),
  })).filter((group) => group.tools.length > 0);
}
