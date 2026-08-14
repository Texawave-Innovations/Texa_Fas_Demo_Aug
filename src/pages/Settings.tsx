"use client"
import { useState, useEffect } from "react"
import { Layout } from "@/components/layout/Layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Archive,
  ClipboardCheck,
  Package,
  Truck,
  Server,
  Settings,
  Shield,
  Save,
  RotateCcw,
  Landmark,
  Wrench,
  Globe,
  History,
  FolderLock,
} from "lucide-react"
import { getRecord, updateRecord, createRecord, logAudit } from "@/services/firebase"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useOrgSettings } from "@/context/OrgSettingsContext"
import { COUNTRY_LIST } from "@/lib/countryConfig"

// All menu items with their IDs matching Sidebar
const MENU_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "sales",     label: "Sales",      icon: ShoppingCart },
  { id: "hr",        label: "HR",         icon: Users },
  { id: "production",label: "Production", icon: Archive },
  { id: "quality",   label: "Quality",    icon: ClipboardCheck },
  { id: "inventory", label: "Inventory",    icon: Package },
  { id: "dispatch",  label: "Dispatch",     icon: Truck },
  { id: "finance",   label: "Accounts",     icon: Landmark },
  { id: "cmms",      label: "Maintenance",  icon: Wrench },
  { id: "vault",     label: "Document Vault", icon: FolderLock },
  { id: "master",    label: "Master Lists",icon: Server },
  { id: "audit",     label: "Audit Trail", icon: History },
  { id: "settings",  label: "Settings",   icon: Settings },
]

// All roles in the system
const ROLES = [
  { id: "admin",       label: "Admin",            color: "bg-purple-100 text-purple-800" },
  { id: "sales",       label: "Sales",            color: "bg-blue-100 text-blue-800" },
  { id: "hr",          label: "HR",               color: "bg-green-100 text-green-800" },
  { id: "accountant",  label: "Accountant",        color: "bg-yellow-100 text-yellow-800" },
  { id: "manager",     label: "Manager",           color: "bg-orange-100 text-orange-800" },
  { id: "quality",     label: "Quality",           color: "bg-red-100 text-red-800" },
  { id: "production",  label: "Production",        color: "bg-teal-100 text-teal-800" },
  { id: "maintenance", label: "Maintenance",       color: "bg-cyan-100 text-cyan-800" },
]

// Default permissions (fallback)
const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  admin:       ["dashboard", "sales", "hr", "quality", "production", "inventory", "dispatch", "finance", "cmms", "vault", "master", "audit", "settings"],
  sales:       ["dashboard", "sales"],
  hr:          ["dashboard", "hr"],
  accountant:  ["dashboard", "finance"],
  manager:     ["dashboard", "production", "quality", "inventory", "dispatch", "cmms", "vault"],
  quality:     ["dashboard", "quality", "vault"],
  production:  ["dashboard", "production", "vault"],
  maintenance: ["dashboard", "cmms", "vault"],
}

// Human-readable summary of what changed between two role→modules maps,
// e.g. "Manager: +Document Vault, -Reports; Quality: +Audit Trail"
const describePermissionDiff = (before: Record<string, string[]>, after: Record<string, string[]>) => {
  const moduleLabel = (id: string) => MENU_ITEMS.find((m) => m.id === id)?.label || id
  const roleLabel = (id: string) => ROLES.find((r) => r.id === id)?.label || id
  const lines: string[] = []
  for (const role of ROLES.map((r) => r.id)) {
    const prev = before[role] || []
    const next = after[role] || []
    const granted = next.filter((m) => !prev.includes(m)).map(moduleLabel)
    const revoked = prev.filter((m) => !next.includes(m)).map(moduleLabel)
    if (granted.length === 0 && revoked.length === 0) continue
    const parts = []
    if (granted.length) parts.push(`+${granted.join(', ')}`)
    if (revoked.length) parts.push(`-${revoked.join(', ')}`)
    lines.push(`${roleLabel(role)}: ${parts.join(', ')}`)
  }
  return lines.join('; ')
}

export default function SettingsPage() {
  // permissions: role → set of allowed module IDs
  const [permissions, setPermissions] = useState<Record<string, string[]>>(DEFAULT_PERMISSIONS)
  // Snapshot of what's actually persisted, so Save can log a before/after diff
  const [lastSavedPermissions, setLastSavedPermissions] = useState<Record<string, string[]>>(DEFAULT_PERMISSIONS)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const { country, countryConfig, setCountry } = useOrgSettings()
  const [savingCountry, setSavingCountry] = useState(false)

  const handleCountryChange = async (code: string) => {
    setSavingCountry(true)
    try {
      await setCountry(code)
      toast.success(`Organization country set to ${COUNTRY_LIST.find(c => c.code === code)?.name}`)
    } catch {
      toast.error("Failed to update country")
    } finally {
      setSavingCountry(false)
    }
  }

  // Load from Firebase on mount
  useEffect(() => {
    const load = async () => {
      try {
        const data = await getRecord("settings", "rolePermissions") as any
        if (data) {
          const version = data._version || 1;
          const loadedPermissions: Record<string, string[]> = {};

          for (const role of ROLES.map(r => r.id)) {
            const savedPerms = data[role] || DEFAULT_PERMISSIONS[role] || [];
            // Carry forward newly-added module defaults for saves made before
            // they existed, so upgrading doesn't silently hide new modules.
            const carryForward: string[] = [];
            if (version < 2) carryForward.push('inventory', 'dispatch');
            if (version < 3) carryForward.push('finance', 'cmms');
            if (version < 4) carryForward.push('audit');
            if (version < 5) carryForward.push('vault');
            const newDefaults = (DEFAULT_PERMISSIONS[role] || []).filter(p => carryForward.includes(p));
            loadedPermissions[role] = Array.from(new Set([...savedPerms, ...newDefaults]));
          }
          setPermissions(loadedPermissions)
          setLastSavedPermissions(loadedPermissions)
        }
      } catch {
        // use defaults
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const toggle = (role: string, moduleId: string) => {
    // Admin always keeps dashboard + settings (can't remove)
    if (role === "admin" && (moduleId === "dashboard" || moduleId === "settings")) return

    setPermissions((prev) => {
      const current = prev[role] || []
      const has = current.includes(moduleId)
      return {
        ...prev,
        [role]: has ? current.filter((m) => m !== moduleId) : [...current, moduleId],
      }
    })
  }

  const hasPermission = (role: string, moduleId: string) =>
    (permissions[role] || []).includes(moduleId)

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = {
        ...permissions,
        _version: 5
      }
      // Save to Firebase - try update first, create if not exists
      try {
        await updateRecord("settings", "rolePermissions", payload, { skipAudit: true })
      } catch {
        await createRecord("settings", payload, { skipAudit: true })
      }
      // Also persist to localStorage so AuthContext can read it immediately
      localStorage.setItem("erp_role_permissions", JSON.stringify(payload))
      const diff = describePermissionDiff(lastSavedPermissions, permissions)
      if (diff) {
        logAudit("settings", "rolePermissions", "permission_change", diff)
      }
      setLastSavedPermissions(permissions)
      toast.success("Privileges saved successfully")
    } catch {
      toast.error("Failed to save privileges")
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setPermissions(DEFAULT_PERMISSIONS)
    toast.info("Reset to default permissions")
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <p className="text-muted-foreground">Loading privileges...</p>
      </div>
    )
  }

  return (
    <Layout>
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-blue-600" />
            Settings — Privileges
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Control which menu sections each role can access. Changes take effect on next login.
          </p>
        </div>
      </div>

      {/* Organization Country */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4 text-blue-600" />
            Organization Country
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Drives currency formatting, date format, and tax terminology across the Accounts module.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 flex-wrap">
            <Select value={country} onValueChange={handleCountryChange} disabled={savingCountry}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUNTRY_LIST.map((c) => (
                  <SelectItem key={c.code} value={c.code}>{c.flag} {c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Currency: <strong className="text-foreground">{countryConfig.currencyCode} ({countryConfig.currencySymbol})</strong></span>
              <span>Tax: <strong className="text-foreground">{countryConfig.taxLabel} @ {countryConfig.defaultTaxRate}%</strong></span>
              <span>Date format: <strong className="text-foreground">{countryConfig.dateFormat}</strong></span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={handleReset}>
          <RotateCcw className="h-4 w-4 mr-1" />
          Reset to Default
        </Button>
        <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
          <Save className="h-4 w-4 mr-1" />
          {saving ? "Saving..." : "Save Privileges"}
        </Button>
      </div>

      {/* Privileges Matrix */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Role × Menu Access Matrix</CardTitle>
          <p className="text-xs text-muted-foreground">
            Toggle to enable/disable menu items per role. Admin always retains access to Dashboard & Settings.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-5 py-3 text-sm font-semibold text-muted-foreground w-36">
                    Role
                  </th>
                  {MENU_ITEMS.map((menu) => {
                    const Icon = menu.icon
                    return (
                      <th
                        key={menu.id}
                        className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground min-w-[90px]"
                      >
                        <div className="flex flex-col items-center gap-1">
                          <Icon className="h-4 w-4" />
                          <span>{menu.label}</span>
                        </div>
                      </th>
                    )
                  })}
                  <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground w-28">
                    Access Count
                  </th>
                </tr>
              </thead>
              <tbody>
                {ROLES.map((role, idx) => {
                  const count = (permissions[role.id] || []).length
                  return (
                    <tr
                      key={role.id}
                      className={`border-b transition-colors hover:bg-muted/30 ${idx % 2 === 0 ? "" : "bg-muted/10"}`}
                    >
                      {/* Role label */}
                      <td className="px-5 py-4">
                        <Badge className={`font-semibold text-xs ${role.color} border-0`}>
                          {role.label}
                        </Badge>
                      </td>

                      {/* Toggle per menu */}
                      {MENU_ITEMS.map((menu) => {
                        const locked =
                          role.id === "admin" &&
                          (menu.id === "dashboard" || menu.id === "settings")
                        const enabled = hasPermission(role.id, menu.id)
                        return (
                          <td key={menu.id} className="px-3 py-4 text-center">
                            <div className="flex justify-center">
                              <Switch
                                checked={enabled}
                                disabled={locked}
                                onCheckedChange={() => toggle(role.id, menu.id)}
                                className={locked ? "opacity-50 cursor-not-allowed" : ""}
                              />
                            </div>
                          </td>
                        )
                      })}

                      {/* Access count */}
                      <td className="px-5 py-4 text-right">
                        <span
                          className={`text-sm font-bold ${
                            count === 0
                              ? "text-red-500"
                              : count <= 2
                              ? "text-orange-500"
                              : "text-green-600"
                          }`}
                        >
                          {count} / {MENU_ITEMS.length}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-blue-500"></span>
          Toggle ON = role can see this menu
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-gray-300"></span>
          Toggle OFF = menu hidden for this role
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-purple-300 opacity-50"></span>
          Greyed out = locked (cannot change)
        </span>
      </div>
    </div>
    </Layout>
  )
}
