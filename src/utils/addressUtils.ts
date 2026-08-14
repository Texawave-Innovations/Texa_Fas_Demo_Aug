export interface Address {
  id?: string;
  type?: 'billing' | 'shipping';
  label?: string;
  street?: string;
  address?: string;
  area?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  isDefault?: boolean;
}

export const formatAddress = (addr: any): string => {
  if (!addr) return "";
  if (typeof addr === 'string') return addr;
  
  return [
    addr.street || addr.address || "", 
    addr.area || "",
    addr.city ? `${addr.city}${addr.state ? `, ${addr.state}` : ""}${addr.pincode ? ` - ${addr.pincode}` : ""}` : "",
    addr.country || ""
  ].filter(Boolean).join("\n");
};

export const getFormattedCustomerAddress = (customer: any, savedAddress: any, type: 'billing' | 'shipping' = 'billing'): string => {
  // Try to find the matching address by ID
  if (savedAddress && typeof savedAddress === 'object' && savedAddress.id && customer?.addresses) {
    const updated = customer.addresses.find((a: any) => a.id === savedAddress.id);
    if (updated) return formatAddress(updated);
  }
  
  // Fallback to customer's live default address
  if (customer?.addresses?.length > 0) {
    const defaultAddr = customer.addresses.find((a: any) => a.type === type && a.isDefault) 
      || customer.addresses.find((a: any) => a.type === type)
      || customer.addresses[0];
    if (defaultAddr) {
      return formatAddress(defaultAddr);
    }
  }

  // Base fallback
  if (typeof savedAddress === 'string') return savedAddress;
  return formatAddress(savedAddress);
};
