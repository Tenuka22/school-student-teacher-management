import { adminProcedure } from "../../../index";

export const createPeriodConfig = adminProcedure.handler(() => {
  throw new Error("Period configuration is code-defined");
});
