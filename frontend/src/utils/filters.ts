/** Active/inactive filter shared by list pages, mapped to the API's `is_active` parameter. */
export type ActiveFilter = 'all' | 'active' | 'inactive'

export const ACTIVE_FILTER_VALUES: Record<ActiveFilter, boolean | undefined> = {
  all: undefined,
  active: true,
  inactive: false,
}
