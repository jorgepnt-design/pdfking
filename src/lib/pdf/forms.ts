import { loadPdfDocument, saveDocument } from "./loadDocument";

export type FormFieldType =
  "text" | "checkbox" | "dropdown" | "optionlist" | "radio" | "button" | "sonstiges";

export interface FormFieldInfo {
  name: string;
  type: FormFieldType;
  value: string | boolean | null;
  options?: string[];
  readOnly: boolean;
}

export interface DetectedForm {
  hasForm: boolean;
  fields: FormFieldInfo[];
}

export async function detectFormFields(bytes: Uint8Array): Promise<DetectedForm> {
  const doc = await loadPdfDocument(bytes);
  try {
    const form = doc.getForm();
    const fields: FormFieldInfo[] = [];

    for (const field of form.getFields()) {
      const name = field.getName();
      const ctor = field.constructor.name;

      if (ctor === "PDFTextField") {
        const textField = doc.getForm().getTextField(name);
        fields.push({
          name,
          type: "text",
          value: textField.getText() ?? "",
          readOnly: field.isReadOnly(),
        });
      } else if (ctor === "PDFCheckBox") {
        const checkbox = doc.getForm().getCheckBox(name);
        fields.push({
          name,
          type: "checkbox",
          value: checkbox.isChecked(),
          readOnly: field.isReadOnly(),
        });
      } else if (ctor === "PDFDropdown") {
        const dropdown = doc.getForm().getDropdown(name);
        fields.push({
          name,
          type: "dropdown",
          value: dropdown.getSelected()[0] ?? null,
          options: dropdown.getOptions(),
          readOnly: field.isReadOnly(),
        });
      } else if (ctor === "PDFOptionList") {
        const list = doc.getForm().getOptionList(name);
        fields.push({
          name,
          type: "optionlist",
          value: list.getSelected()[0] ?? null,
          options: list.getOptions(),
          readOnly: field.isReadOnly(),
        });
      } else if (ctor === "PDFRadioGroup") {
        const radio = doc.getForm().getRadioGroup(name);
        fields.push({
          name,
          type: "radio",
          value: radio.getSelected() ?? null,
          options: radio.getOptions(),
          readOnly: field.isReadOnly(),
        });
      } else if (ctor === "PDFButton") {
        fields.push({ name, type: "button", value: null, readOnly: field.isReadOnly() });
      } else {
        fields.push({ name, type: "sonstiges", value: null, readOnly: field.isReadOnly() });
      }
    }
    return { hasForm: fields.length > 0, fields };
  } catch {
    return { hasForm: false, fields: [] };
  }
}

export interface FormValues {
  [name: string]: string | boolean;
}

export async function fillForm(
  bytes: Uint8Array,
  values: FormValues,
  flatten: boolean,
): Promise<Uint8Array> {
  const doc = await loadPdfDocument(bytes);
  const form = doc.getForm();
  const errors: string[] = [];

  for (const [name, value] of Object.entries(values)) {
    try {
      if (typeof value === "boolean") {
        const checkbox = form.getCheckBox(name);
        if (value) checkbox.check();
        else checkbox.uncheck();
        continue;
      }
      let handled = false;
      try {
        const textField = form.getTextField(name);
        textField.setText(value);
        handled = true;
      } catch {
        /* kein Textfeld */
      }
      if (!handled) {
        try {
          const dropdown = form.getDropdown(name);
          dropdown.select(value);
          handled = true;
        } catch {
          /* kein Dropdown */
        }
      }
      if (!handled) {
        try {
          const optionList = form.getOptionList(name);
          optionList.select(value);
          handled = true;
        } catch {
          /* keine Liste */
        }
      }
      if (!handled) {
        try {
          const radio = form.getRadioGroup(name);
          radio.select(value);
          handled = true;
        } catch {
          /* kein Radio */
        }
      }
      if (!handled) errors.push(name);
    } catch {
      errors.push(name);
    }
  }

  if (flatten) form.flatten();

  void errors;
  return saveDocument(doc);
}
