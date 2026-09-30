import type { InventoryCategoryIcon } from "@school-student-teacher-management/db/constants/inventory";
import {
  IconArmchair,
  IconBallBasketball,
  IconCategory,
  IconChefHat,
  IconDeviceDesktop,
  IconFlask,
  IconSpray,
  IconVideo,
} from "@tabler/icons-react";
import { createElement } from "react";

/**
 * Every category's Tabler glyph, keyed by the name `inventory_category.icon`
 * stores.
 *
 * The column is a closed set — `INVENTORY_CATEGORY_ICON_KEYS`, the eight keys
 * `DEFAULT_INVENTORY_CATEGORIES` use, with a check constraint behind them — and
 * this table is the contract the schema's doc comment says it is: an answer for
 * every key the column may hold, so a key this build does not recognise (a
 * rename in a later release, a row written by a newer app) degrades to the
 * generic `category` glyph rather than to a blank space or a crash.
 */
const CATEGORY_ICONS = {
  "device-desktop": IconDeviceDesktop,
  flask: IconFlask,
  "ball-basketball": IconBallBasketball,
  video: IconVideo,
  armchair: IconArmchair,
  spray: IconSpray,
  "chef-hat": IconChefHat,
  category: IconCategory,
} satisfies Record<InventoryCategoryIcon, typeof IconCategory>;

/**
 * The glyph for a stored key, and the generic one for anything else.
 *
 * An absent key is the honest case rather than an error: `CategoryChoice` — the
 * shape a synthesised stand-in for a deleted category is built in — carries a
 * name and a colour off the item row and no icon, because the item views do not
 * project one. Rendering the fallback there is a display decision; inventing a
 * key would have been a record claiming something the database never held.
 */
const categoryIconComponent = (
  icon: string | null | undefined
): typeof IconCategory => {
  if (
    icon === null ||
    icon === undefined ||
    !Object.hasOwn(CATEGORY_ICONS, icon)
  ) {
    return IconCategory;
  }
  return CATEGORY_ICONS[icon as InventoryCategoryIcon];
};

interface CategoryIconProps {
  /** The stored key, when the record has one; anything else falls back. */
  icon?: string | null;
  /**
   * The category's own hex, which tints the glyph.
   *
   * The colour a reader already knows from the register is what makes a glyph
   * recognisable at a glance, so the two travel together rather than the icon
   * arriving in the foreground colour and asking to be learned again.
   */
  color?: string | null;
  className?: string;
}

/**
 * A category as a glyph instead of a bare colour dot.
 *
 * Always `aria-hidden`: the category's **name** is beside it in every row, and a
 * glyph that was the only channel would leave a reader who cannot tell two of
 * them apart with no way to tell the categories apart at all — which is the same
 * reasoning the colour dot had, with the added fact that a glyph is also an
 * image of the thing itself (a chair for Furniture, a flask for Lab Equipment).
 */
export const CategoryIcon = ({ icon, color, className }: CategoryIconProps) =>
  createElement(categoryIconComponent(icon), {
    "aria-hidden": true,
    className,
    style: color ? { color } : undefined,
  });
