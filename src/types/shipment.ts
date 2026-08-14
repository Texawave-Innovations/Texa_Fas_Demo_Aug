export interface Shipment {
  id: string;
  shipmentId: string;
  packingListId: string;
  invoiceId: string;
  orderId: string;
  customerName: string;
  transporterName?: string;
  vehicleNo?: string;
  transportationMode: string;
  dispatchDate: string;
  dispatchTime?: string;
  deliveryStatus: 'Pending' | 'In Transit' | 'Delivered';
  numberOfPackages: number;
  grossWeight?: number;
  netWeight?: number;
  remarks?: string;
  deliveredDate?: string;
  createdAt: number;
}

export interface SalesSettings {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyWebsite?: string;
  companyGSTIN: string;
  companyPAN: string;
  companyCIN: string;
  defaultDeliveryTerm: string;
  defaultPaymentTerms: string;
  defaultModeOfDispatch: string;
  defaultPlaceOfSupply: string;
  defaultQuoteValidity: string;
  bankAccounts: BankAccount[];
  authorizedSignatory: {
    name: string;
    designation: string;
  };
  numberingFormats: {
    sqPrefix: string;
    soPrefix: string;
    plPrefix: string;
    invoicePrefix: string;
  };
}

export interface BankAccount {
  id: string;
  bankName: string;
  accountNo: string;
  ifscCode: string;
  branch: string;
  isDefault: boolean;
}
