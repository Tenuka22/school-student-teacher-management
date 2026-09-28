import {
  Field,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@school-student-teacher-management/ui/components/input-group";
import { IconSearch } from "@tabler/icons-react";

import { useDebouncedListSearch } from "./use-debounced-list-search";

/**
 * A list's search box, wired to the debounce.
 *
 * ## One box, in one shape
 *
 * There are two search boxes in this app — `ui-patterns/search-input.tsx` and the
 * `Field` + `InputGroup` pair the inventory filter bar uses — and a list that
 * picked the other one would look like a different application. So the list's box
 * lives here, and a surface that needs a differently-shaped search field says so
 * in its own file rather than inventing a third.
 *
 * The debounce is inside this component on purpose: a list's search writes to the
 * URL, so a surface that remembered to debounce and one that forgot would fail in
 * the same way — a request per keystroke, and a stale response repainting the list
 * with the rows for a term nobody finished typing.
 */
export const DataTableSearchField = ({
  id,
  label = "Search",
  onCommit,
  placeholder,
  value,
  className,
}: {
  /** Namespaced per table by the caller, so two tables on a page do not collide. */
  id: string;
  label?: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  /** The committed term — what the server was asked for, which is the URL. */
  value: string;
  className?: string;
}) => {
  const { draft, setDraft } = useDebouncedListSearch(value, onCommit);

  return (
    <Field className={className ?? "min-w-[16rem] flex-1"}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <IconSearch
            aria-hidden="true"
            className="text-muted-foreground size-4"
          />
        </InputGroupAddon>
        <InputGroupInput
          id={id}
          type="search"
          placeholder={placeholder}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </InputGroup>
    </Field>
  );
};
