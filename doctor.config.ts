import type { ReactDoctorConfig } from "react-doctor/api";

export default {
  ignore: {
    overrides: [
      {
        files: [
          "scripts/**"
        ],
        rules: [
          "deslop/unused-export"
        ]
      }
    ]
  }
} satisfies ReactDoctorConfig;
