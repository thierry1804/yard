// UI container type strings (src/data/config.js TYPES) <-> backend
// ContainerType enum values (backend/prisma/schema.prisma).
const UI_TO_API = {
  'empty-20': 'EMPTY_20',
  'empty-40': 'EMPTY_40',
  'full-20': 'FULL_20',
  'full-40': 'FULL_40',
  reefer: 'REEFER',
  'reefer-full': 'REEFER_FULL',
};

const API_TO_UI = Object.fromEntries(Object.entries(UI_TO_API).map(([ui, api]) => [api, ui]));

export function toApiType(uiType) {
  return UI_TO_API[uiType] ?? uiType;
}

export function toUiType(apiType) {
  return API_TO_UI[apiType] ?? apiType;
}
