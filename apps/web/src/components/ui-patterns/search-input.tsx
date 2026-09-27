import { Input } from "@school-student-teacher-management/ui/components/input";
import { IconSearch } from "@tabler/icons-react";
import { useId } from "react";

interface SearchInputProps {
  /** Accessible name. Always required; shown visibly when `showLabel`. */
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  showLabel?: boolean;
  id?: string;
  className?: string;
}

/**
 * A search box that always has a programmatic label (WCAG 1.3.1 / 4.1.2),
 * with the magnifier drawn inside the field.
 */
export const SearchInput = ({
  label,
  value,
  onValueChange,
  placeholder,
  showLabel = false,
  id,
  className,
}: SearchInputProps) => {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className={className}>
      <label
        htmlFor={inputId}
        className={
          showLabel
            ? "text-foreground mb-1.5 block text-sm font-medium"
            : "sr-only"
        }
      >
        {label}
      </label>
      <div className="relative">
        <IconSearch
          aria-hidden="true"
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <Input
          id={inputId}
          type="search"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder={placeholder}
          className="pl-9"
          autoComplete="off"
        />
      </div>
    </div>
  );
};
