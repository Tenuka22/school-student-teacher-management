import { academicProcedure } from "../../../index";

export const createPeriodConfig = academicProcedure.handler(() => {
  throw new Error("Period configuration is code-defined");
});
