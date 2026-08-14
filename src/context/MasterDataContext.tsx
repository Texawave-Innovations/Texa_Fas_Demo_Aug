import React, { createContext, useContext, useState, useEffect } from 'react';
import { MasterData } from '@/types';
import { database } from '@/services/firebase';
import { ref, onValue, off } from 'firebase/database';

interface MasterDataContextType {
  masterData: MasterData | null;
  loading: boolean;
}

const MasterDataContext = createContext<MasterDataContextType | undefined>(undefined);

/**
 * Firebase stores master list items as { value: string; status: 'active' | 'inactive' }.
 * This helper normalises any such array into plain strings (active items only),
 * so that dropdowns always receive string[], not object[].
 */
const normaliseMasterList = (raw: any): string[] => {
  if (!raw) return [];
  const arr: any[] = Array.isArray(raw)
    ? raw
    : Object.keys(raw)
        .filter((k) => !isNaN(Number(k)))
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => raw[k])
        .filter((item) => item !== null && item !== undefined);
  return arr
    .filter((item) => {
      if (typeof item === 'string') return true;
      if (item && typeof item === 'object') return item.status !== 'inactive';
      return false;
    })
    .map((item) => (typeof item === 'string' ? item : String(item.value ?? item)));
};

const defaultMasterData: MasterData = {
  sales: {
    paymentTerms: ['30 Days', '45 Days', '60 Days', 'Advance 50%', 'Full Advance'],
    deliveryTerms: ['7 Days', '10 Days', 'Immediate', 'Next Day'],
    dispatchModes: ['Transport', 'Courier', 'Hand Delivery', 'Lorry'],
    gstList: ['5%', '12%', '18%', '28%'],
  },
  hr: {
    departments: ['Production', 'Quality', 'HR', 'Sales', 'Stores', 'Finance'],
    designations: ['Operator', 'Helper', 'Inspector', 'Supervisor', 'Manager'],
    leaveTypes: ['CL', 'SL', 'PL', 'LOP'],
    shifts: ['Shift A', 'Shift B', 'Shift C', 'General Shift'],
    holidayList: ['2025-01-14', '2025-01-26', '2025-03-10'],
    employeeStatus: ['Active', 'Inactive', 'Resigned'],
  },
  quality: {
    rejectionReasons: ['Burr', 'Flash', 'Underweight', 'Dimension Issue', 'Improper Curing'],
    inspectionTypes: ['Incoming QC', 'In-Process QC', 'Final QC'],
    tagStatus: ['Before Inspection', 'After Inspection'],
  },
  production: {
    machines: {
      MC01: { name: 'Machine 01' },
      MC02: { name: 'Machine 02' },
    },
    dies: {
      DIE01: { name: 'Die No 01' },
      DIE12: { name: 'Die No 12' },
    },
    compoundCodes: ['CMPD09', 'CMPD12', 'CMPD15'],
    rejectionCategories: ['A Grade', 'B Grade', 'C Grade'],
    productionStages: ['Moulding', 'Store', 'Trimming', 'WIP', 'FG'],
    parts: {
      part001: {
        name: 'Rubber Seal',
        partNumber: 'RS001',
        inputWeight: 12,
        cycleTime: 40,
        cavity: 2,
      },
    },
  },
  stores: {
    rawMaterialCategories: ['Compound', 'Packing Material', 'Misc Items'],
    uomList: ['pcs', 'kg', 'grams', 'liters', 'meters'],
    stockLocations: ['Raw Store', 'WIP Area', 'FG Store', 'Scrap Store'],
    suppliers: {
      sup001: { name: 'Sri Ram Polymers', phone: '9876543210' },
    },
  },
  finance: {
    expenseTypes: ['Raw Material', 'Maintenance', 'Transport', 'Electricity', 'Others'],
    paymentModes: ['Cash', 'NEFT', 'RTGS', 'UPI', 'Cheque'],
  },
};

export const MasterDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [masterData, setMasterData] = useState<MasterData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const mastersRef = ref(database, 'masters');

    const unsubscribe = onValue(mastersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const merged: MasterData = {
          sales: {
            ...defaultMasterData.sales,
            ...(data.sales || {}),
            // Normalise lists that GeneralMaster stores as { value, status } objects
            ...(data.sales
              ? {
                  paymentTerms:   normaliseMasterList(data.sales.paymentTerms),
                  deliveryTerms:  normaliseMasterList(data.sales.deliveryTerms),
                  dispatchModes:  normaliseMasterList(data.sales.dispatchModes),
                  gstList:        normaliseMasterList(data.sales.gstList),
                  itemCategories: normaliseMasterList(data.sales.itemCategories),
                  itemTypes:      normaliseMasterList(data.sales.itemTypes),
                  itemGroups:     normaliseMasterList(data.sales.itemGroups),
                  units:          normaliseMasterList(data.sales.units),
                  warehouses:     normaliseMasterList(data.sales.warehouses),
                  expireDates:    normaliseMasterList(data.sales.expireDates),
                }
              : {}),
          },
          hr: {
            ...defaultMasterData.hr,
            ...(data.hr || {}),
          },
          quality: {
            ...defaultMasterData.quality,
            ...(data.quality || {}),
          },
          production: {
            ...defaultMasterData.production,
            ...(data.production || {}),
          },
          stores: {
            ...defaultMasterData.stores,
            ...(data.stores || {}),
            // Normalise storageLocations (new key) and the legacy stockLocations key
            ...(data.stores
              ? {
                  storageLocations: normaliseMasterList(
                    data.stores.storageLocations ?? data.stores.stockLocations
                  ),
                  stockLocations: normaliseMasterList(
                    data.stores.storageLocations ?? data.stores.stockLocations
                  ),
                }
              : {}),
          },
          finance: {
            ...defaultMasterData.finance,
            ...(data.finance || {}),
          },
        };
        setMasterData(merged);
      } else {
        // Initialize with default data if not exists
        setMasterData(defaultMasterData);
      }
      setLoading(false);
    });

    return () => off(mastersRef, 'value', unsubscribe);
  }, []);

  return (
    <MasterDataContext.Provider value={{ masterData, loading }}>
      {children}
    </MasterDataContext.Provider>
  );
};

export const useMasterData = () => {
  const context = useContext(MasterDataContext);
  if (context === undefined) {
    throw new Error('useMasterData must be used within a MasterDataProvider');
  }
  return context;
};