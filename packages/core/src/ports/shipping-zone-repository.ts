import type { ShippingZone } from "../domain/shipping";

export interface ShippingZoneRepository {
  list(): Promise<ShippingZone[]>;
}
