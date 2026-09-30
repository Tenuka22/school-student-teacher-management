import { STRUCTURE_VERSIONS } from "@school-student-teacher-management/db/constants/structureVersions/index";

import { academicProcedure } from "../../index";

export const listStructureVersions = academicProcedure.handler(() =>
  Object.values(STRUCTURE_VERSIONS).map((version) => ({
    key: version.key,
    description: version.description,
    entryCount: version.entries.length,
    subversions: Object.values(version.subversions).map((sub) => ({
      subversion: sub.subversion,
      description: sub.description,
      createdAt: sub.createdAt,
      entryCount: sub.entries.length,
      hasDelta: sub.delta !== undefined,
    })),
  }))
);
