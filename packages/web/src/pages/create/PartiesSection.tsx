import type { CreateFieldErrorCode } from "@dispute-resolver/core";
import { Button, TextField } from "@kleros/ui-components-library";
import { useState } from "react";
import { AtlasFileField, type UploadedFile } from "../../atlas";
import { WriteStatusNotice } from "../../wallet";
import { useChainGuard } from "./chainGuard";
import type { SectionProps } from "./CourtSection";
import { addParty, canonicalDocument, removeParty, setParty, setPrimaryDocument, type PartyRow } from "./draft";
import { FULL_WIDTH_FIELD, FieldSlot, FormGroup, errorProps } from "./fields";
import { fieldErrorMessage } from "./messages";

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
    <li className="grid grid-cols-1 items-start gap-3 max-lg:py-4 max-lg:first:pt-0 max-lg:last:pb-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
      <FieldSlot name="partyAliases">
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
      <FieldSlot name="partyAddresses">
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
      <Button
        text="Remove"
        aria-label={`Remove party ${number}`}
        variant="secondary"
        small
        className="self-start lg:mt-6"
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
 * The primary document (spec §4.3): uploading it signs in to Atlas when needed (D-52); the returned path goes through
 * core's canonical check before it enters the draft (B16), and a path that fails it is refused with a message. With the
 * wallet on another chain the field is locked and the switch is offered, so no sign-in is requested (B3, D-48); without
 * a wallet the field's own Connect offer applies.
 */
export function DocumentSection({ form, errors, onChange }: SectionProps) {
  const [refused, setRefused] = useState(false);
  const guard = useChainGuard();
  const wrongChain = guard?.phase === "wrong-chain" ? guard : null;
  const code = refused ? "not-content-addressed" : errors.primaryDocument;
  return (
    <FormGroup title="Primary document" description="Optional. A file jurors can open from the dispute, such as a contract or the rules that apply.">
      <FieldSlot name="primaryDocument">
        <AtlasFileField
          role="evidence"
          label="Primary Document (Optional)"
          value={form.primaryDocument}
          isDisabled={wrongChain !== null}
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
