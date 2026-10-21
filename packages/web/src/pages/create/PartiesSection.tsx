import type { CreateFieldErrorCode } from "@dispute-resolver/core";
import { Button, TextField } from "@kleros/ui-components-library";
import { useState } from "react";
import { AtlasFileField, type UploadedFile } from "../../atlas";
import { WriteStatusNotice, useWriteAccess } from "../../wallet";
import type { SectionProps } from "./CourtSection";
import { addParty, canonicalDocument, removeParty, setParty, setPrimaryDocument, type PartyRow } from "./draft";
import { FULL_WIDTH_FIELD, FieldSlot, FormGroup, errorProps } from "./fields";
import { fieldErrorMessage } from "./messages";

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="size-5 fill-none stroke-current text-klerosUIComponentsPrimaryBlue"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.5 5.5h13M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5 5.5l.75 10.6a1 1 0 0 0 1 .9h6.5a1 1 0 0 0 1-.9L15 5.5M8.5 9v5M11.5 9v5" />
    </svg>
  );
}

/** Which of a party row's two fields a validation error belongs to (D-08, B20). */
function partyErrors(code: CreateFieldErrorCode | undefined): { readonly alias?: string; readonly address?: string } {
  if (code === undefined) return {};
  const message = fieldErrorMessage("party", code);
  return code === "address-without-alias" ? { alias: message } : { address: message };
}

function PartyFields({
  party,
  position,
  error,
  onChange,
}: {
  readonly party: PartyRow;
  readonly position: number;
  readonly error: CreateFieldErrorCode | undefined;
  readonly onChange: SectionProps["onChange"];
}) {
  const number = String(position + 1);
  const messages = partyErrors(error);
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 max-lg:py-4 max-lg:first:pt-0 max-lg:last:pb-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
      <FieldSlot className="col-span-2 lg:col-span-1">
        <TextField
          label={`Alias ${number} (Optional)`}
          value={party.alias}
          validationBehavior="aria"
          onChange={(value) => {
            onChange((current) => setParty(current, party.key, "alias", value));
          }}
          className={FULL_WIDTH_FIELD}
          {...errorProps(messages.alias)}
        />
      </FieldSlot>
      <FieldSlot>
        <TextField
          label={`Address ${number} (Optional)`}
          value={party.address}
          validationBehavior="aria"
          placeholder="0x…"
          inputProps={{ spellCheck: false, autoComplete: "off", className: "font-mono" }}
          onChange={(value) => {
            onChange((current) => setParty(current, party.key, "address", value));
          }}
          className={FULL_WIDTH_FIELD}
          {...errorProps(messages.address)}
        />
      </FieldSlot>
      {/* 45 px tall like the input, and pushed past the field's label line so it centres on the input. */}
      <Button
        text=""
        icon={<TrashIcon />}
        aria-label={`Remove party ${number}`}
        variant="secondary"
        className="mt-6 h-[45px] w-11 shrink-0 self-start px-0"
        onPress={() => {
          onChange((current) => removeParty(current, party.key));
        }}
      />
    </li>
  );
}

/** The parties and their aliases (spec §4.3): several rows, each address paired with its own alias (D-08, B20). */
export function PartiesSection({ form, errors, onChange }: SectionProps) {
  return (
    <FormGroup title="Parties" description="Optional. Name the addresses involved, so jurors see who is who.">
      {form.parties.length === 0 ? null : (
        <ul className="flex flex-col gap-4 max-lg:gap-0 max-lg:divide-y max-lg:divide-klerosUIComponentsStroke" aria-label="Parties">
          {form.parties.map((party, position) => (
            <PartyFields key={party.key} party={party} position={position} error={errors.parties?.[position]} onChange={onChange} />
          ))}
        </ul>
      )}
      <Button
        text="Add party"
        variant="secondary"
        small
        className="self-start"
        onPress={() => {
          onChange(addParty);
        }}
      />
    </FormGroup>
  );
}

/**
 * The primary document: uploading it signs in to Atlas when needed; the returned path goes through core's canonical
 * check before it enters the draft, and a path that fails it is refused with a message. Until a wallet is connected on
 * the page chain the field is locked, so no sign-in is requested; on another chain the switch is offered under it.
 */
export function DocumentSection({ chain, form, errors, onChange }: SectionProps) {
  const [refused, setRefused] = useState(false);
  const access = useWriteAccess(chain.id);
  const wrongChain = access.status === "wrong-chain" ? access.guard : null;
  const code = refused ? "not-content-addressed" : errors.primaryDocument;
  return (
    <FormGroup title="Primary document" description="Optional. A file jurors can open from the dispute, such as a contract or the rules that apply.">
      <FieldSlot>
        <AtlasFileField
          role="evidence"
          label="Primary Document (Optional)"
          value={form.primaryDocument}
          isDisabled={access.status !== "ready"}
          onUploaded={(file: UploadedFile) => {
            const document = canonicalDocument(file);
            setRefused(document === null);
            onChange((current) => setPrimaryDocument(current, document));
          }}
          onCleared={() => {
            setRefused(false);
            onChange((current) => setPrimaryDocument(current, null));
          }}
        />
        {wrongChain === null ? null : <WriteStatusNotice status={wrongChain} className="mt-2" />}
        {code === undefined ? null : (
          <p role="alert" className="mt-2 text-sm text-klerosUIComponentsError">
            {fieldErrorMessage("primaryDocument", code)}
          </p>
        )}
      </FieldSlot>
    </FormGroup>
  );
}
