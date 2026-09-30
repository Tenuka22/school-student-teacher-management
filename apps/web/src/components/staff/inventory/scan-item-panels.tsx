import {
  ITEM_CONDITIONS,
  itemConditionLabel,
} from "@school-student-teacher-management/db/constants/inventory";
import type { ItemCondition } from "@school-student-teacher-management/db/constants/inventory";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Field,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";
import { Textarea } from "@school-student-teacher-management/ui/components/textarea";
import { IconArrowBack, IconPackageExport } from "@tabler/icons-react";
import { useState } from "react";

/**
 * The two forms on the scanned-item page, as two components rather than two
 * closures inside the route.
 *
 * They were `renderHandBack()` and `renderRequest()` — functions defined in the
 * route component's body and called from its JSX, which is the one shape that
 * makes a route file read as a page and a dialog at the same time. The route
 * passed 300 lines to `react-doctor`'s `no-giant-component` because of it, and
 * that rule is right about the diagnosis: three mutations, two dialog-shaped
 * forms and a layout is three reasons for a file to exist.
 *
 * **Each panel owns its own open/closed and field state.** That is why they are
 * components and not extracted JSX fragments: the alternative passes `isOpen`,
 * `onOpen`, `note`, `onNoteChange`, `condition`, `onConditionChange`,
 * `isPending` and `onSubmit` into each one, which is a prop bag longer than the
 * form is, and the reset-after-success behaviour (clear the note, close the
 * form) would have to be duplicated in the route for each.
 *
 * The route keeps the three `useMutation` calls, because they are where the
 * toasts and the invalidation live, and each panel is handed the one call it
 * needs to make. The route therefore decides *what happens* and this file
 * decides *what the form looks like*.
 */

export interface HandBackPanelProps {
  /** The person the hand-back lands on — see the note on `managerStaffId` below. */
  managerName: string | null;
  /**
   * The destination's id, and it is also the *only* destination: a roster picker
   * is deliberately absent. `releaseCustody` sits on the narrow `take` grant, and
   * only leadership may redirect a hand-back to somebody other than the person in
   * charge — which is the server's rule, not a limitation of this form — so the
   * destination is a fact about the item rather than a choice. It is also the only
   * destination whose name the page already has: the staff roster the register's
   * picker reads is `inventoryOverseerProcedure`, which a teacher cannot call.
   *
   * A legacy item with nobody in charge therefore has nowhere to land. The panel
   * says so and the button is disabled, because the server would refuse the
   * write either way — a refusal stated before the click beats one after it.
   */
  managerStaffId: string | null;
  isPending: boolean;
  onConfirm: (input: {
    newCustodianStaffId: string;
    note?: string;
    condition?: ItemCondition;
  }) => void;
}

export const HandBackPanel = ({
  managerName,
  managerStaffId,
  isPending,
  onConfirm,
}: HandBackPanelProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [note, setNote] = useState("");
  const [condition, setCondition] = useState<ItemCondition | "">("");

  if (!isOpen) {
    return (
      <Button
        data-icon="inline-start"
        onClick={() => {
          setIsOpen(true);
        }}
        type="button"
        variant="outline"
      >
        <IconArrowBack data-icon="inline-start" />
        Hand this back
      </Button>
    );
  }

  return (
    <div className="border-primary/14 flex flex-col gap-3 border p-4">
      <p className="text-sm">
        Handing it to{" "}
        <span className="font-semibold">
          {managerName ?? "nobody — this item has no person in charge"}
        </span>
        , the person in charge of this item. The register always names a holder,
        so a hand-back lands on a person rather than on a shelf.
      </p>
      <Field>
        <FieldLabel htmlFor="scan-hand-back-condition">
          Condition (optional)
        </FieldLabel>
        <Select
          onValueChange={(value) => {
            setCondition((value as ItemCondition | null) ?? "");
          }}
          value={condition}
        >
          <SelectTrigger id="scan-hand-back-condition">
            <SelectValue placeholder="Leave unchanged" />
          </SelectTrigger>
          <SelectContent>
            {ITEM_CONDITIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {itemConditionLabel(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="scan-hand-back-note">
          Add a note (optional)
        </FieldLabel>
        <Textarea
          id="scan-hand-back-note"
          onChange={(event) => {
            setNote(event.target.value);
          }}
          placeholder="Where it is going, or anything the next person should know."
          rows={2}
          value={note}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button
          disabled={isPending}
          onClick={() => {
            setIsOpen(false);
          }}
          type="button"
          variant="ghost"
        >
          Cancel
        </Button>
        <Button
          disabled={isPending || !managerStaffId}
          onClick={() => {
            if (!managerStaffId) {
              return;
            }

            onConfirm({
              newCustodianStaffId: managerStaffId,
              note: note || undefined,
              condition: condition || undefined,
            });
          }}
          type="button"
        >
          {isPending ? "Handing back…" : "Confirm hand-back"}
        </Button>
      </div>
      {/*
        **This form does not close itself on success**, and that is a real
        consequence of lifting the mutation into the route: the write, the toast
        and the invalidation all live there, so nothing here can know it
        succeeded. What happens in practice is that the route's refetch replaces
        the page's data, `item.canHandBack` goes false for a holder who no longer
        holds it, and the route stops rendering this panel — so the state is
        discarded with it in the case that matters. The window is a hand-back of
        an item the reader may still hand back (a day-level release that leaves
        them as holder), where the note stays in the textarea and would travel
        with the next one. The register's own hand-back dialog has no such window
        because it unmounts on success.
      */}
    </div>
  );
};

export interface RequestPanelProps {
  isPending: boolean;
  custodianName: string | null;
  onConfirm: (input: { itemId: string; note?: string }) => void;
  itemId: string;
}

/**
 * "Request this item from whoever is holding it" — the ask rather than the take.
 *
 * The route decides whether to render it at all (`item.canRequest`), so this
 * component answers only "what does the form look like once it has been decided
 * that it may be offered".
 */
export const RequestPanel = ({
  isPending,
  custodianName,
  onConfirm,
  itemId,
}: RequestPanelProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [note, setNote] = useState("");
  const holder = custodianName ?? "its holder";

  if (!isOpen) {
    return (
      <Button
        data-icon="inline-start"
        onClick={() => {
          setIsOpen(true);
        }}
        type="button"
      >
        <IconPackageExport data-icon="inline-start" />
        Request this item from {holder}
      </Button>
    );
  }

  return (
    <div className="border-primary/14 flex flex-col gap-3 border p-4">
      <Field>
        <FieldLabel htmlFor="scan-request-note">
          Note to {custodianName ?? "the holder"} (optional)
        </FieldLabel>
        <Textarea
          id="scan-request-note"
          onChange={(event) => {
            setNote(event.target.value);
          }}
          placeholder="Need it for period 3 on Thursday"
          rows={2}
          value={note}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button
          disabled={isPending}
          onClick={() => {
            setIsOpen(false);
          }}
          type="button"
          variant="ghost"
        >
          Cancel
        </Button>
        <Button
          disabled={isPending}
          onClick={() => {
            onConfirm({ itemId, note: note || undefined });
          }}
          type="button"
        >
          {isPending ? "Sending…" : "Send request"}
        </Button>
      </div>
    </div>
  );
};
