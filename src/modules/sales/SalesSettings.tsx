import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Plus, Trash2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { SalesSettings, BankAccount } from '@/types/shipment';
import { getRecord, updateRecord, createRecord } from '@/services/firebase';

export default function SalesSettingsPage() {
  const [settings, setSettings] = useState<SalesSettings>({
    companyName: 'Fluoro Automation Seals Pvt Ltd',
    companyAddress: '3/180, Rajiv Gandhi Road, Mettukuppam, Chennai Tamil Nadu 600097 India',
    companyPhone: '+91-9841175097',
    companyEmail: 'fas@fluoroautomationseals.com',
    companyWebsite: '',
    companyGSTIN: '33AAECF2716M1ZO',
    companyPAN: 'AAECF2716M',
    companyCIN: 'U25209TN2020PTC138498',
    defaultDeliveryTerm: '1 to 2 Weeks From Receipt of Order',
    defaultPaymentTerms: '30 Days',
    defaultModeOfDispatch: 'Courier',
    defaultPlaceOfSupply: 'Tamil Nadu',
    defaultQuoteValidity: '30 Days',
    bankAccounts: [],
    authorizedSignatory: {
      name: '',
      designation: 'Commercial Manager',
    },
    numberingFormats: {
      sqPrefix: 'SQFY',
      soPrefix: 'SOFY',
      plPrefix: 'SPMTFY',
      invoicePrefix: '25',
    },
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await getRecord('sales/settings', 'default');
      if (data) {
        setSettings(data as SalesSettings);
      }
    } catch (error) {
      // Settings don't exist yet, use defaults
    }
  };

  const handleSave = async () => {
    try {
      const existing = await getRecord('sales/settings', 'default');
      if (existing) {
        await updateRecord('sales/settings', 'default', settings);
      } else {
        // Create record manually with ID
        await updateRecord('sales/settings', 'default', settings);
      }
      toast.success('Settings saved successfully');
    } catch (error) {
      toast.error('Failed to save settings');
    }
  };

  const addBankAccount = () => {
    setSettings({
      ...settings,
      bankAccounts: [
        ...settings.bankAccounts,
        {
          id: Date.now().toString(),
          bankName: '',
          accountNo: '',
          ifscCode: '',
          branch: '',
          isDefault: settings.bankAccounts.length === 0,
        },
      ],
    });
  };

  const removeBankAccount = (id: string) => {
    setSettings({
      ...settings,
      bankAccounts: settings.bankAccounts.filter(acc => acc.id !== id),
    });
  };

  const updateBankAccount = (id: string, field: keyof BankAccount, value: any) => {
    setSettings({
      ...settings,
      bankAccounts: settings.bankAccounts.map(acc =>
        acc.id === id ? { ...acc, [field]: value } : acc
      ),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Sales Settings</h1>
          <p className="text-muted-foreground mt-1">Configure sales templates and company details</p>
        </div>
        <Button onClick={handleSave}>
          <Save className="h-4 w-4 mr-2" />
          Save Settings
        </Button>
      </div>

      {/* Company Details */}
      <Card>
        <CardHeader>
          <CardTitle>Company Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Company Name</Label>
              <Input
                value={settings.companyName}
                onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={settings.companyPhone}
                onChange={(e) => setSettings({ ...settings, companyPhone: e.target.value })}
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                value={settings.companyEmail}
                onChange={(e) => setSettings({ ...settings, companyEmail: e.target.value })}
              />
            </div>
            <div>
              <Label>Website</Label>
              <Input
                value={settings.companyWebsite}
                onChange={(e) => setSettings({ ...settings, companyWebsite: e.target.value })}
                placeholder="Optional"
              />
            </div>
            <div className="col-span-2">
              <Label>Address</Label>
              <Textarea
                value={settings.companyAddress}
                onChange={(e) => setSettings({ ...settings, companyAddress: e.target.value })}
                rows={2}
              />
            </div>
            <div>
              <Label>GSTIN</Label>
              <Input
                value={settings.companyGSTIN}
                onChange={(e) => setSettings({ ...settings, companyGSTIN: e.target.value })}
              />
            </div>
            <div>
              <Label>PAN</Label>
              <Input
                value={settings.companyPAN}
                onChange={(e) => setSettings({ ...settings, companyPAN: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <Label>CIN</Label>
              <Input
                value={settings.companyCIN}
                onChange={(e) => setSettings({ ...settings, companyCIN: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Default Terms */}
      <Card>
        <CardHeader>
          <CardTitle>Default Terms & Conditions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Default Delivery Term</Label>
              <Input
                value={settings.defaultDeliveryTerm}
                onChange={(e) => setSettings({ ...settings, defaultDeliveryTerm: e.target.value })}
              />
            </div>
            <div>
              <Label>Default Payment Terms</Label>
              <Input
                value={settings.defaultPaymentTerms}
                onChange={(e) => setSettings({ ...settings, defaultPaymentTerms: e.target.value })}
              />
            </div>
            <div>
              <Label>Default Mode of Dispatch</Label>
              <Input
                value={settings.defaultModeOfDispatch}
                onChange={(e) => setSettings({ ...settings, defaultModeOfDispatch: e.target.value })}
              />
            </div>
            <div>
              <Label>Default Place of Supply</Label>
              <Input
                value={settings.defaultPlaceOfSupply}
                onChange={(e) => setSettings({ ...settings, defaultPlaceOfSupply: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <Label>Default Quote Validity</Label>
              <Input
                value={settings.defaultQuoteValidity}
                onChange={(e) => setSettings({ ...settings, defaultQuoteValidity: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bank Accounts */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Bank Accounts</CardTitle>
          <Button onClick={addBankAccount} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Bank
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings.bankAccounts.map((account, index) => (
            <div key={account.id} className="p-4 border rounded-lg space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="font-medium">Bank Account {index + 1}</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeBankAccount(account.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Bank Name</Label>
                  <Input
                    value={account.bankName}
                    onChange={(e) => updateBankAccount(account.id, 'bankName', e.target.value)}
                    placeholder="e.g., Canara Bank"
                  />
                </div>
                <div>
                  <Label>Account Number</Label>
                  <Input
                    value={account.accountNo}
                    onChange={(e) => updateBankAccount(account.id, 'accountNo', e.target.value)}
                  />
                </div>
                <div>
                  <Label>IFSC Code</Label>
                  <Input
                    value={account.ifscCode}
                    onChange={(e) => updateBankAccount(account.id, 'ifscCode', e.target.value)}
                  />
                </div>
                <div>
                  <Label>Branch</Label>
                  <Input
                    value={account.branch}
                    onChange={(e) => updateBankAccount(account.id, 'branch', e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={account.isDefault}
                  onChange={(e) => updateBankAccount(account.id, 'isDefault', e.target.checked)}
                  className="w-4 h-4"
                />
                <Label>Default Bank</Label>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Authorized Signatory */}
      <Card>
        <CardHeader>
          <CardTitle>Authorized Signatory</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Name</Label>
              <Input
                value={settings.authorizedSignatory.name}
                onChange={(e) => setSettings({
                  ...settings,
                  authorizedSignatory: { ...settings.authorizedSignatory, name: e.target.value }
                })}
              />
            </div>
            <div>
              <Label>Designation</Label>
              <Input
                value={settings.authorizedSignatory.designation}
                onChange={(e) => setSettings({
                  ...settings,
                  authorizedSignatory: { ...settings.authorizedSignatory, designation: e.target.value }
                })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Document Numbering */}
      <Card>
        <CardHeader>
          <CardTitle>Document Numbering Formats</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Quotation Prefix (SQ)</Label>
              <Input
                value={settings.numberingFormats.sqPrefix}
                onChange={(e) => setSettings({
                  ...settings,
                  numberingFormats: { ...settings.numberingFormats, sqPrefix: e.target.value }
                })}
                placeholder="SQFY"
              />
            </div>
            <div>
              <Label>Sales Order Prefix (SO)</Label>
              <Input
                value={settings.numberingFormats.soPrefix}
                onChange={(e) => setSettings({
                  ...settings,
                  numberingFormats: { ...settings.numberingFormats, soPrefix: e.target.value }
                })}
                placeholder="SOFY"
              />
            </div>
            <div>
              <Label>Packing List Prefix</Label>
              <Input
                value={settings.numberingFormats.plPrefix}
                onChange={(e) => setSettings({
                  ...settings,
                  numberingFormats: { ...settings.numberingFormats, plPrefix: e.target.value }
                })}
                placeholder="SPMTFY"
              />
            </div>
            <div>
              <Label>Invoice Prefix</Label>
              <Input
                value={settings.numberingFormats.invoicePrefix}
                onChange={(e) => setSettings({
                  ...settings,
                  numberingFormats: { ...settings.numberingFormats, invoicePrefix: e.target.value }
                })}
                placeholder="25"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
