"use client"
import { useState, useEffect, useRef } from "react"
import { useParams, useNavigate, useLocation } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Download, ArrowLeft, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"
import html2canvas from "html2canvas"
import jsPDF from "jspdf"
import {
  createRecord,
  getAllRecords,
  getRecord,
  updateRecord,
  deleteRecord,
} from "@/services/firebase"
import { generateNextNumber, peekNextNumber } from '@/services/runningNumberService'
import fas from "./fas.png"
import { getFormattedCustomerAddress } from "@/utils/addressUtils"

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
  AED: "د.إ",
}

const ITEMS_FIRST_PAGE = 8
const ITEMS_OTHER_PAGES = 12

interface LineItem {
  sNo: number
  partCode: string
  description: string
  hsnCode: string
  availableStock?: number
  invoicedQty: number
  uom: string
  rate: number
  amount: number
  discount: number
  discountPercent: number
  cgstPercent: number
  sgstPercent: number
  igstPercent: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  taxableValue: number
  fgIds?: string
  // ✅ NEW: to track inventory record id for real-time deduction
  inventoryId?: string
}

export default function CreateInvoice() {
  const { id } = useParams<{ id?: string }>()
  const location = useLocation()
  const bankDetails = {
    bankName: "Canara Bank",
    accountNo: "9921201001078",
    ifscCode: "CNRB0002617",
    branch: "Perungudi, Chennai 600096."
  };
  const navigate = useNavigate();
  const printRef = useRef<HTMLDivElement>(null)
  const fgPreFillApplied = useRef(false)

  const urlParams = new URLSearchParams(window.location.search)
  const isDuplicateMode = urlParams.get("duplicate") === "true"
  const isEditMode = !!id && !isDuplicateMode
  const autoOrderId = urlParams.get("orderId") || ""

  // Form States
  const [mode, setMode] = useState<"order" | "direct" | "rawmaterial">("order")
  const [invoiceNumber, setInvoiceNumber] = useState("")
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0])
  const [transportMode, setTransportMode] = useState("Courier")
  const [transporterName, setTransporterName] = useState("")
  const [vehicleNo, setVehicleNo] = useState("")
  const [dateTimeOfSupply, setDateTimeOfSupply] = useState(new Date().toISOString().slice(0, 16))
  const [placeOfSupply, setPlaceOfSupply] = useState("Tamil Nadu")
  const [customerPONo, setCustomerPONo] = useState("")
  const [customerPODate, setCustomerPODate] = useState("")
  const [paymentTerms, setPaymentTerms] = useState("30 Days")
  const [eWayBillNo, setEWayBillNo] = useState("")
  const [eWayBillDate, setEWayBillDate] = useState("")
  const [remarks, setRemarks] = useState("")
  const [terms, setTerms] = useState("Certified that the Particulars given above are true and correct")

  // Tax States
  const [applyCGST, setApplyCGST] = useState(false)
  const [applySGST, setApplySGST] = useState(false)
  const [applyIGST, setApplyIGST] = useState(false)
  const [cgstPercent, setCgstPercent] = useState<number | ''>('');
  const [sgstPercent, setSgstPercent] = useState<number | ''>('');
  const [igstPercent, setIgstPercent] = useState<number | ''>('');

  // Transport Charge States
  const [transportCharge, setTransportCharge] = useState<number | ''>('');
  const [transportChargePercent, setTransportChargePercent] = useState<number | ''>('');
  const [transportChargeType, setTransportChargeType] = useState<"fixed" | "percent">("fixed")

  const [loadingInvoice, setLoadingInvoice] = useState(false)

  // Data States
  const [orders, setOrders] = useState<any[]>([])
  const [allOrders, setAllOrders] = useState<any[]>([])
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)
  const [quotation, setQuotation] = useState<any | null>(null)
  const [customers, setCustomers] = useState<any[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null)
  const [fgStock, setFgStock] = useState<any[]>([])
  const [products, setProducts] = useState<Record<string, any>>({})
  const [allProductItems, setAllProductItems] = useState<any[]>([])
  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [inspections, setInspections] = useState<any[]>([])
  // inventory state
  const [inventoryItems, setInventoryItems] = useState<any[]>([])

  // ── Searchable combobox states ──────────────────────────────────────────────
  const [orderSearch, setOrderSearch] = useState("")
  const [orderDropdownOpen, setOrderDropdownOpen] = useState(false)
  const [directCustSearch, setDirectCustSearch] = useState("")
  const [directCustOpen, setDirectCustOpen] = useState(false)
  const [rawCustSearch, setRawCustSearch] = useState("")
  const [rawCustOpen, setRawCustOpen] = useState(false)
  const [directProdSearch, setDirectProdSearch] = useState("")
  const [directProdOpen, setDirectProdOpen] = useState(false)
  const [rawProdSearch, setRawProdSearch] = useState("")
  const [rawProdOpen, setRawProdOpen] = useState(false)

  // ── Dropdown refs for click-outside close ────────────────────────────────
  const orderDropdownRef = useRef<HTMLDivElement>(null)
  const rawCustDropdownRef = useRef<HTMLDivElement>(null)
  const rawProdDropdownRef = useRef<HTMLDivElement>(null)

  const currency = selectedOrder?.currency || selectedCustomer?.currency || "INR"
  const symbol = CURRENCY_SYMBOLS[currency]

  // ── Invoice Number: PEEK on load (no increment), GENERATE on actual save ───
  useEffect(() => {
    if (!isEditMode && !invoiceNumber) {
      const now = new Date()
      const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
      const fy = `${fyStart}-${String(fyStart + 1).slice(-2)}`
      const fallback = `FAS/${fy}/${String(Date.now()).slice(-5)}`
      // Peek – does NOT increment counter
      peekNextNumber('invoiceNo', fallback).then(setInvoiceNumber)
    }
  }, [isEditMode, invoiceNumber])

  // ── Click-outside: close all searchable dropdowns ─────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (orderDropdownRef.current && !orderDropdownRef.current.contains(e.target as Node))
        setOrderDropdownOpen(false)
      if (rawCustDropdownRef.current && !rawCustDropdownRef.current.contains(e.target as Node))
        setRawCustOpen(false)
      if (rawProdDropdownRef.current && !rawProdDropdownRef.current.contains(e.target as Node))
        setRawProdOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Auto-populate GST from customer (same as Create Order Manually) ───────
  useEffect(() => {
    if (!selectedCustomer || mode === 'order') return
    const c = selectedCustomer
    const hasCgst = c.cgst != null && c.cgst !== '' && Number(c.cgst) > 0
    const hasSgst = c.sgst != null && c.sgst !== '' && Number(c.sgst) > 0
    const hasIgst = c.igst != null && c.igst !== '' && Number(c.igst) > 0
    setApplyCGST(hasCgst)
    setApplySGST(hasSgst)
    setApplyIGST(hasIgst)
    setCgstPercent(hasCgst ? Number(c.cgst) : '')
    setSgstPercent(hasSgst ? Number(c.sgst) : '')
    setIgstPercent(hasIgst ? Number(c.igst) : '')
  }, [selectedCustomer, mode])

  // ✅ CHANGE 1: Load All Data — add inventory fetch + fix eligible orders filter
  useEffect(() => {
    const loadAll = async () => {
      try {
        const [oaData, custData, fgData, prodData, quotData, inspData, invData] = await Promise.all([
          getAllRecords("sales/orderAcknowledgements"),
          getAllRecords("sales/customers"),
          getAllRecords("stores/fg"),
          getAllRecords("sales/products"),
          getAllRecords("sales/quotations"),
          getAllRecords("quality/inspections"),
          // ✅ NEW: fetch inventory table
          getAllRecords("inventory"),
        ])

        setAllOrders(oaData as any[])
        const activeCustomers = (custData as any[]).filter(c => c.status !== 'inactive')
        setCustomers(activeCustomers)
        setFgStock(fgData as any[])
        setInspections(inspData as any[])
        // ✅ NEW: store inventory
        setInventoryItems(invData as any[])

        // Process Products correctly from sales/products table
        const activeProducts = (prodData as any[]).filter(p => p.status !== 'inactive')
        const flatItems: any[] = []
        const prodMap: Record<string, any> = {}
        activeProducts.forEach((productDoc: any) => {
          if (productDoc.items && Array.isArray(productDoc.items)) {
            productDoc.items.forEach((item: any) => {
              const productCode = item.productCode
              if (productCode) {
                prodMap[productCode] = item
                flatItems.push(item)
              }
            })
          }
        })
        setProducts(prodMap)
        setAllProductItems(flatItems)

        const quotMap = (quotData as any[]).reduce((acc: any, q: any) => {
          if (q.quoteNumber) acc[q.quoteNumber] = q
          return acc
        }, {})
          ; (window as any).quotMap = quotMap

        // Include any order that has inventory items with okQty > 0 (ready to bill)
        const eligible = (oaData as any[]).filter((order: any) => {
          // Check if customer is active
          const isCustomerActive = activeCustomers.some(c => c.companyName === order.customerName || c.id === order.customerId)
          if (!isCustomerActive) return false

          // Always include if there are ready items in inventory — regardless of invoiceStatus
          const hasReadyItems = (invData as any[]).some(
            (inv: any) =>
              (inv.orderId === order.id || inv.soNumber === order.soNumber) &&
              Number(inv.okQty || 0) > 0
          )
          if (hasReadyItems) return true

          // Also include fully completed orders even if inventory is empty
          return (
            order.status === "QC Completed" ||
            order.qcStatus === "completed" ||
            order.status === "Production Completed" ||
            order.status === "Completed" ||
            order.productionStatus === "completed"
          )
        })
        setOrders(eligible)
      } catch (err) {
        console.error(err)
        toast.error("Failed to load data")
      }
    }
    loadAll()
  }, [])

  // Load Quotation
  useEffect(() => {
    if (!selectedOrder?.quotationNumber) {
      setQuotation(null)
      return
    }
    const map = (window as any).quotMap
    const q = map?.[selectedOrder.quotationNumber]
    setQuotation(q || null)
  }, [selectedOrder])

  // Load Existing Invoice (Edit Mode)
  useEffect(() => {
    if (!id) return

    const load = async () => {
      setLoadingInvoice(true)
      try {
        const inv: any = await getRecord("sales/invoices", id)
        if (!inv) throw new Error()

        setInvoiceDate(inv.invoiceDate)
        setTransportMode(inv.transportMode || "Courier")
        setTransporterName(inv.transporterName || "")
        setVehicleNo(inv.vehicleNo || "")
        setDateTimeOfSupply(inv.dateTimeOfSupply || new Date().toISOString().slice(0, 16))
        setPlaceOfSupply(inv.placeOfSupply || "Tamil Nadu")
        setCustomerPONo(inv.customerPO || "")
        setCustomerPODate(inv.customerPODate || "")
        setPaymentTerms(inv.paymentTerms || "30 Days")
        setEWayBillNo(inv.eWayBillNo || "")
        setEWayBillDate(inv.eWayBillDate || "")
        setRemarks(inv.remarks || "")
        setTerms(inv.terms || "Certified that the Particulars given above are true and correct")
        setApplyCGST(inv.applyCGST ?? true)
        setApplySGST(inv.applySGST ?? true)
        setApplyIGST(inv.applyIGST ?? false)

        setCgstPercent(typeof inv.cgstPercent === "number" ? inv.cgstPercent : 9)
        setSgstPercent(typeof inv.sgstPercent === "number" ? inv.sgstPercent : 9)
        setIgstPercent(typeof inv.igstPercent === "number" ? inv.igstPercent : 18)

        setTransportCharge(inv.transportCharge || 0)
        setTransportChargeType(inv.transportChargeType || "fixed")
        setTransportChargePercent(inv.transportChargePercent || "")

        const items = (inv.lineItems || []).map((li: any, i: number) => {
          const qty = Number(li.qty || li.invoicedQty || 0)
          const rate = Number(li.rate || 0)
          const amount = qty * rate
          const discount = Number(li.discount || 0)
          const discountPercent = Number(li.discountPercent || 0)
          const taxableValue = amount - discount

          return {
            sNo: i + 1,
            partCode: li.partCode || li.productCode,
            description: li.description || li.productName,
            hsnCode: li.hsnCode || "39269099",
            availableStock: li.availableStock || 0,
            invoicedQty: qty,
            uom: li.uom || "NOS",
            rate,
            amount,
            discount,
            discountPercent,
            cgstPercent: Number(li.cgstPercent || 9),
            sgstPercent: Number(li.sgstPercent || 9),
            igstPercent: Number(li.igstPercent || 18),
            cgstAmount: Number(li.cgstAmount || 0),
            sgstAmount: Number(li.sgstAmount || 0),
            igstAmount: Number(li.igstAmount || 0),
            taxableValue,
            fgIds: li.fgIds || "",
            // ✅ restore inventoryId in edit mode
            inventoryId: li.inventoryId || "",
          }
        })

        setLineItems(items)

        // Load Order / Customer
        if (inv.orderId) {
          setMode("order")
          const order = allOrders.find((o: any) => o.id === inv.orderId)
          if (order) setSelectedOrder(order)
        } else {
          setMode(inv.mode || "direct")
          const cust = customers.find((c: any) => c.id === inv.customerId)
          if (cust) setSelectedCustomer(cust)
        }

        if (!isDuplicateMode) {
          setInvoiceNumber(inv.invoiceNumber)
        }
      } catch (err) {
        toast.error("Invoice not found")
        navigate("/sales/invoices")
      } finally {
        setLoadingInvoice(false)
      }
    }

    if (allOrders.length > 0 && customers.length > 0) {
      load()
    }
  }, [id, isDuplicateMode, allOrders, customers, navigate])

  // Auto-select order when navigated from Live Tracking with ?orderId=
  useEffect(() => {
    if (!autoOrderId || isEditMode || selectedOrder || allOrders.length === 0) return
    handleOrderChange(autoOrderId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOrderId, allOrders, inventoryItems])

  // Pre-fill from Inventory → Move to Invoice navigation
  useEffect(() => {
    const fgItem = (location.state as any)?.fgItem
    if (!fgItem || isEditMode || fgPreFillApplied.current) return
    // Wait for orders to load when there's a soNumber to match
    if (fgItem.soNumber && allOrders.length === 0) return

    fgPreFillApplied.current = true

    const prefillLine: LineItem = {
      sNo:             1,
      partCode:        fgItem.productCode,
      description:     fgItem.productName,
      hsnCode:         '',
      availableStock:  fgItem.quantity,
      invoicedQty:     fgItem.quantity,
      uom:             fgItem.uom || 'NOS',
      rate:            0,
      amount:          0,
      discount:        0,
      discountPercent: 0,
      cgstPercent:     9,
      sgstPercent:     9,
      igstPercent:     18,
      cgstAmount:      0,
      sgstAmount:      0,
      igstAmount:      0,
      taxableValue:    0,
      fgIds:           '',
    }

    // If there's a soNumber, look up the order for customer/PO/GST auto-fill
    if (fgItem.soNumber && allOrders.length > 0) {
      const order = allOrders.find((o: any) => o.soNumber === fgItem.soNumber)
      if (order) {
        setMode('order')
        setSelectedOrder(order)
        // Resolve customer so billing/shipping address is populated on the invoice
        const customer = customers.find(
          (c: any) => c.companyName === order.customerName || c.id === order.customerId
        )
        if (customer) setSelectedCustomer(customer)
        setCustomerPONo(order.customerPONo || '')
        setCustomerPODate(order.customerPODate || '')
        if (typeof order.applyCGST === 'boolean') setApplyCGST(order.applyCGST)
        if (typeof order.applySGST === 'boolean') setApplySGST(order.applySGST)
        if (typeof order.applyIGST === 'boolean') setApplyIGST(order.applyIGST)
        if (order.cgstPercent != null && order.cgstPercent !== '') setCgstPercent(Number(order.cgstPercent))
        if (order.sgstPercent != null && order.sgstPercent !== '') setSgstPercent(Number(order.sgstPercent))
        if (order.igstPercent != null && order.igstPercent !== '') setIgstPercent(Number(order.igstPercent))
          // Pull rate from the matching order line item so amount isn't ₹0
        const matchingLI = (order.lineItems || []).find(
          (li: any) => li.productCode === fgItem.productCode || li.partCode === fgItem.productCode
        )
        if (matchingLI) {
          const rate = Number(matchingLI.unitPrice || matchingLI.rate || 0)
          prefillLine.rate = rate
          prefillLine.amount = prefillLine.invoicedQty * rate
          prefillLine.taxableValue = prefillLine.amount
        }
        setLineItems([prefillLine])
        return
      }
    }

    // Fallback: direct mode (no matching order found)
    setMode('direct')
    setLineItems([prefillLine])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, allOrders, isEditMode])

  const customerState =
    selectedOrder?.customerState || selectedCustomer?.addresses?.[0]?.state || "Tamil Nadu"

  // Recalculate Item
  const recalcItem = (item: LineItem): LineItem => {
    const amount = item.invoicedQty * item.rate
    const discount =
      item.discountPercent > 0 ? (amount * item.discountPercent) / 100 : item.discount
    const taxableValue = amount - discount

    let cgstAmount = 0
    let sgstAmount = 0
    let igstAmount = 0

    if (currency === "INR") {
      if (applyCGST && item.cgstPercent > 0) {
        cgstAmount = (taxableValue * item.cgstPercent) / 100
      }
      if (applySGST && item.sgstPercent > 0) {
        sgstAmount = (taxableValue * item.sgstPercent) / 100
      }
      if (applyIGST && item.igstPercent > 0) {
        igstAmount = (taxableValue * item.igstPercent) / 100
      }
    }

    return {
      ...item,
      amount,
      discount,
      taxableValue,
      cgstAmount: Number(cgstAmount.toFixed(2)),
      sgstAmount: Number(sgstAmount.toFixed(2)),
      igstAmount: Number(igstAmount.toFixed(2)),
    }
  }

  // ✅ CRITICAL FIX: Recalculate all line items when tax percentages or apply flags change
  useEffect(() => {
    if (lineItems.length > 0) {
      setLineItems((prev) =>
        prev.map((item) =>
          recalcItem({
            ...item,
            cgstPercent: cgstPercent || 0,
            sgstPercent: sgstPercent || 0,
            igstPercent: igstPercent || 0,
          })
        )
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cgstPercent, sgstPercent, igstPercent, applyCGST, applySGST, applyIGST, currency])

  // Handle Order Change — fetch line items & auto-populate GST from order
  const handleOrderChange = (orderId: string) => {
    const order = allOrders.find((o) => o.id === orderId)
    if (!order) return

    setSelectedOrder(order)
    setSelectedCustomer(null)
    setOrderDropdownOpen(false)
    setOrderSearch("")

    setCustomerPONo(order.customerPONo || '')
    setCustomerPODate(order.customerPODate || '')

    // ── Auto-populate GST configuration from order ─────────────────────────
    if (typeof order.applyCGST === 'boolean') setApplyCGST(order.applyCGST)
    if (typeof order.applySGST === 'boolean') setApplySGST(order.applySGST)
    if (typeof order.applyIGST === 'boolean') setApplyIGST(order.applyIGST)
    if (order.cgstPercent != null && order.cgstPercent !== '') setCgstPercent(Number(order.cgstPercent))
    if (order.sgstPercent != null && order.sgstPercent !== '') setSgstPercent(Number(order.sgstPercent))
    if (order.igstPercent != null && order.igstPercent !== '') setIgstPercent(Number(order.igstPercent))

    // Filter inventory items matching this order, only okQty > 0
    let orderInventoryItems = inventoryItems.filter(
      (inv: any) => inv.orderId === order.id && Number(inv.okQty || 0) > 0
    )

    // Fallback: match by soNumber
    if (orderInventoryItems.length === 0) {
      orderInventoryItems = inventoryItems.filter(
        (inv: any) => inv.soNumber === order.soNumber && Number(inv.okQty || 0) > 0
      )
    }

    if (orderInventoryItems.length === 0) {
      toast.info("No inventory records with OK qty found for this order")
      setLineItems([])
      return
    }

    const items = orderInventoryItems
      .map((inv: any, i: number) => {
        const okQty = Number(inv.okQty || 0)
        if (okQty === 0) return null

        const rate = Number(inv.unitRate || 0)

        return recalcItem({
          sNo: i + 1,
          partCode: inv.productCode || "",
          description: inv.productDescription || inv.productName || inv.productCode || "",
          hsnCode: inv.hsnCode || "39269099",
          availableStock: okQty,
          invoicedQty: okQty,
          uom: inv.unit || "NOS",
          rate,
          amount: 0,
          discount: 0,
          discountPercent: 0,
          cgstPercent: cgstPercent || 9,
          sgstPercent: sgstPercent || 9,
          igstPercent: igstPercent || 18,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: 0,
          taxableValue: 0,
          fgIds: "",
          inventoryId: inv.id || "",
        })
      })
      .filter(Boolean) as LineItem[]

    setLineItems(items)
  }

  // Add FG Item (Finished Goods from FG Stock)
  const addFgItem = (productCode: string) => {
    const fgItems = fgStock.filter((f: any) => f.productCode === productCode && f.qc === "ok")
    const totalAvailable = fgItems.reduce((s: number, f: any) => s + Number(f.quantity), 0)

    if (totalAvailable === 0) {
      toast.info("No FG stock available")
      return
    }

    if (lineItems.find((i) => i.partCode === productCode)) {
      toast.info("Already added")
      return
    }

    const prod = products[productCode]
    const rate = Number(prod?.unitPrice || 0)

    const newItem: LineItem = recalcItem({
      sNo: lineItems.length + 1,
      partCode: productCode,
      description: prod?.category ? `${prod.category} - ${prod.group}` : productCode,
      hsnCode: prod?.hsn || "39269099",
      availableStock: totalAvailable,
      invoicedQty: 1,
      uom: prod?.unit || "NOS",
      rate,
      amount: 0,
      discount: 0,
      discountPercent: 0,
      cgstPercent: cgstPercent || 9,
      sgstPercent: sgstPercent || 9,
      igstPercent: igstPercent || 18,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      taxableValue: 0,
      fgIds: "",
    })

    setLineItems([...lineItems, newItem])
  }

  // Add Raw Material Item (from products table stockQty)
  const addRawMaterialItem = (productCode: string) => {
    const prod = products[productCode]

    if (!prod) {
      toast.error("Product not found")
      return
    }

    const available = Number(prod.stockQty || 0)


    const rate = Number(prod.unitPrice || 0)

    const newItem: LineItem = recalcItem({
      sNo: lineItems.length + 1,
      partCode: productCode,
      description: prod.category ? `${prod.category} - ${prod.group}` : productCode,
      hsnCode: prod.hsn || "39269099",
      availableStock: available,
      invoicedQty: 1,
      uom: prod.unit || "NOS",
      rate,
      amount: 0,
      discount: 0,
      discountPercent: 0,
      cgstPercent: cgstPercent || 9,
      sgstPercent: sgstPercent || 9,
      igstPercent: igstPercent || 18,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      taxableValue: 0,
      fgIds: "",
    })

    setLineItems([...lineItems, newItem])
  }

  // Update Qty
  const updateQty = (idx: number, qty: number) => {
    setLineItems((prev) => {
      const updated = [...prev]
      const item = updated[idx]
      const max = item.availableStock || 0
      const newQty = Math.max(0, Math.min(qty, max))
      updated[idx] = recalcItem({ ...item, invoicedQty: newQty })
      return updated
    })
  }

  // Update Item Field
  const updateItemField = (idx: number, field: keyof LineItem, value: any) => {
    setLineItems((prev) => {
      const updated = [...prev]
      updated[idx] = recalcItem({ ...updated[idx], [field]: value })
      return updated
    })
  }

  // Remove Item
  const removeItem = (idx: number) => {
    setLineItems((prev) =>
      prev.filter((_, i) => i !== idx).map((it, i) => ({ ...it, sNo: i + 1 }))
    )
  }

  // Calculate Transport Charge
  const calculateTransportCharge = () => {
    if (transportChargeType === "fixed") {
      return Number(transportCharge || 0)
    } else {
      const itemsTotal = lineItems.reduce((sum, i) => sum + i.taxableValue, 0)
      const percent = Number(transportChargePercent || 0)
      return (itemsTotal * percent) / 100
    }
  }

  const finalTransportCharge = calculateTransportCharge()

  // Calculate Totals
  const calculateTotals = () => {
    const itemsTotal = lineItems.reduce((sum, i) => sum + i.taxableValue, 0)
    const taxable = itemsTotal + finalTransportCharge

    let cgst = 0
    let sgst = 0
    let igst = 0

    if (currency === "INR") {
      const itemsCGST = lineItems.reduce((sum, i) => sum + i.cgstAmount, 0)
      const itemsSGST = lineItems.reduce((sum, i) => sum + i.sgstAmount, 0)
      const itemsIGST = lineItems.reduce((sum, i) => sum + i.igstAmount, 0)

      let transportCGST = 0
      let transportSGST = 0
      let transportIGST = 0

      if (finalTransportCharge > 0) {
        if (applyCGST && Number(cgstPercent) > 0) {
          transportCGST = (finalTransportCharge * Number(cgstPercent)) / 100
        }
        if (applySGST && Number(sgstPercent) > 0) {
          transportSGST = (finalTransportCharge * Number(sgstPercent)) / 100
        }
        if (applyIGST && Number(igstPercent) > 0) {
          transportIGST = (finalTransportCharge * Number(igstPercent)) / 100
        }
      }

      cgst = itemsCGST + transportCGST
      sgst = itemsSGST + transportSGST
      igst = itemsIGST + transportIGST
    }

    const total = taxable + cgst + sgst + igst

    return {
      taxable: Number(taxable.toFixed(2)),
      cgst: Number(cgst.toFixed(2)),
      sgst: Number(sgst.toFixed(2)),
      igst: Number(igst.toFixed(2)),
      total: Number(total.toFixed(2)),
      transportCharge: finalTransportCharge,
    }
  }

  const { taxable, cgst, sgst, igst, total, transportCharge: calculatedTransportCharge } =
    calculateTotals()

  // Format Amount
  const formatAmount = (n: number) =>
    n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Number to Words
  const numberToWords = (num: number): string => {
    if (currency !== "INR") return ""

    const units = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"]
    const teens = [
      "Ten",
      "Eleven",
      "Twelve",
      "Thirteen",
      "Fourteen",
      "Fifteen",
      "Sixteen",
      "Seventeen",
      "Eighteen",
      "Nineteen",
    ]
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

    const integerPart = Math.floor(num)

    if (integerPart === 0) return "Zero Rupees Only"

    let word = ""

    let part = Math.floor(integerPart / 10000000)
    if (part > 0) {
      word += numberToWords(part).replace(" Rupees Only", "") + " Crore "
    }

    part = Math.floor(integerPart / 100000) % 100
    if (part > 0) {
      word += convertTwoDigit(part) + " Lakh "
    }

    part = Math.floor(integerPart / 1000) % 100
    if (part > 0) {
      word += convertTwoDigit(part) + " Thousand "
    }

    part = Math.floor(integerPart / 100) % 10
    if (part > 0) {
      word += units[part] + " Hundred "
    }

    part = integerPart % 100
    if (part > 0) {
      word += convertTwoDigit(part) + " "
    }

    return word.trim() + " Rupees Only"

    function convertTwoDigit(n: number): string {
      if (n < 10) return units[n]
      if (n >= 10 && n < 20) return teens[n - 10]
      return tens[Math.floor(n / 10)] + (n % 10 > 0 ? " " + units[n % 10] : "")
    }
  }

  const amountInWords = numberToWords(total)

  // Deduct From FG Stock
  const deductFromFgStock = async (item: LineItem) => {
    if (item.invoicedQty === 0) return

    let candidates = fgStock.filter(
      (f: any) =>
        f.productCode === item.partCode &&
        f.qc === "ok" &&
        (mode === "order" ? f.soNumber === selectedOrder?.soNumber : true)
    )

    candidates.sort((a: any, b: any) => (a.createdAt || 0) - (b.createdAt || 0))

    let remaining = item.invoicedQty
    for (const fg of candidates) {
      if (remaining <= 0) break

      const deduct = Math.min(remaining, Number(fg.quantity || 0))
      const newQty = Number(fg.quantity || 0) - deduct

      if (newQty <= 0) {
        await deleteRecord("stores/fg", fg.id)
      } else {
        await updateRecord("stores/fg", fg.id, { quantity: newQty })
      }

      remaining -= deduct
    }
  }

  // Deduct from Raw Material Stock (products table)
  const deductFromRawMaterialStock = async (item: LineItem) => {
    if (item.invoicedQty === 0) return

    const prod = products[item.partCode]
    if (!prod) return

    const currentStock = Number(prod.stockQty || 0)
    const newStock = Math.max(0, currentStock - item.invoicedQty)

    // Find the product document ID from allProductItems
    let productDocId = ""
    let itemIndex = -1

    const allProductDocs = await getAllRecords("sales/products")
    for (const doc of allProductDocs as any[]) {
      if (doc.items && Array.isArray(doc.items)) {
        const idx = doc.items.findIndex((i: any) => i.productCode === item.partCode)
        if (idx !== -1) {
          productDocId = doc.id
          itemIndex = idx
          break
        }
      }
    }

    if (productDocId && itemIndex !== -1) {
      // Update the specific item's stockQty in the products array
      const productDoc = allProductDocs.find((d: any) => d.id === productDocId) as any
      const updatedItems = [...productDoc.items]
      updatedItems[itemIndex] = {
        ...updatedItems[itemIndex],
        stockQty: newStock
      }

      await updateRecord("sales/products", productDocId, { items: updatedItems })
    }
  }

  // ✅ NEW: Deduct from Inventory table (for "order" mode) — real-time okQty reduction
  const deductFromInventory = async (item: LineItem) => {
    if (item.invoicedQty === 0 || !item.inventoryId) return

    const invRecord = inventoryItems.find((inv: any) => inv.id === item.inventoryId)
    if (!invRecord) return

    const currentOkQty = Number(invRecord.okQty || 0)
    const newOkQty = Math.max(0, currentOkQty - item.invoicedQty)

    await updateRecord("inventory", item.inventoryId, {
      okQty: newOkQty,
      updatedAt: Date.now(),
    })
  }

  // Handle Save — generate (claim) the invoice number atomically on save
  const handleSave = async () => {
    if (lineItems.length === 0 || lineItems.every((i) => i.invoicedQty === 0)) {
      toast.error("Add at least one item")
      return
    }

    // Resolve customerId: orders only store customerName, not customerId, so look it up
    const resolvedCustomerId =
      selectedOrder?.customerId ||
      selectedCustomer?.id ||
      (selectedOrder?.customerName
        ? (customers.find((c: any) => c.companyName === selectedOrder.customerName) as any)?.id || ""
        : "")

    const payload: any = {
      invoiceNumber,
      invoiceDate,
      customerId: resolvedCustomerId,
      customerName: selectedOrder?.customerName || selectedCustomer?.companyName || "",
      customerGST: selectedOrder?.customerGST || selectedCustomer?.gst || "",
      billingAddress,
      shippingAddress,
      paymentTerms,
      transportMode,
      transporterName,
      vehicleNo,
      dateTimeOfSupply,
      placeOfSupply,
      customerPO: customerPONo,
      customerPODate,
      eWayBillNo,
      eWayBillDate,
      remarks,
      terms,
      applyCGST,
      applySGST,
      applyIGST,
      cgstPercent: Number(cgstPercent) || 0,
      sgstPercent: Number(sgstPercent) || 0,
      igstPercent: Number(igstPercent) || 0,
      currency,
      taxableAmount: taxable - calculatedTransportCharge,
      transportCharge: calculatedTransportCharge,
      transportChargeType,
      transportChargePercent: transportChargePercent || 0,
      cgstAmount: applyCGST ? cgst : 0,
      sgstAmount: applySGST ? sgst : 0,
      igstAmount: applyIGST ? igst : 0,
      grandTotal: total,
      lineItems: lineItems.map((i) => ({
        ...i,
        qty: i.invoicedQty,
        cgstPercent: Number(i.cgstPercent) || 0,
        sgstPercent: Number(i.sgstPercent) || 0,
        igstPercent: Number(i.igstPercent) || 0,
      })),
      mode,
      orderId: mode === "order" ? selectedOrder?.id : null,
      soNumber: mode === "order" ? selectedOrder?.soNumber : null,
      quotationId: quotation?.id || null,
      status: "Generated",
      updatedAt: Date.now(),
    }

    if (!isEditMode) {
      payload.createdAt = Date.now()
    }

    try {
      if (isEditMode && id) {
        await updateRecord("sales/invoices", id, payload)
        toast.success("Invoice updated")
      } else {
        // ── Atomically claim the next invoice number on actual save ──────────
        const now = new Date()
        const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
        const fy = `${fyStart}-${String(fyStart + 1).slice(-2)}`
        const fallback = `FAS/${fy}/${String(Date.now()).slice(-5)}`
        const claimedNumber = await generateNextNumber('invoiceNo', fallback)
        payload.invoiceNumber = claimedNumber
        setInvoiceNumber(claimedNumber)
        await createRecord("sales/invoices", payload)
        toast.success("Invoice created")
      }

      // Update Order invoicedQty cumulatively — 'generated' only when all ordered qty is invoiced
      if (mode === "order" && selectedOrder) {
        const totalBeingInvoiced = lineItems.reduce((sum, li) => sum + li.invoicedQty, 0)

        // Total qty across all order line items
        const totalOrderedQty = (selectedOrder.lineItems || []).reduce(
          (sum: number, li: any) => sum + Number(li.salesQty || li.qty || 0),
          0
        )

        // Cumulative invoiced qty (previous + this invoice)
        const prevInvoicedQty = Number(selectedOrder.invoicedQty || 0)
        const newInvoicedQty = prevInvoicedQty + totalBeingInvoiced

        // Fully invoiced only when cumulative invoiced qty covers all ordered qty
        const fullyInvoiced = totalOrderedQty > 0 && newInvoicedQty >= totalOrderedQty

        await updateRecord("sales/orderAcknowledgements", selectedOrder.id, {
          invoicedQty: newInvoicedQty,
          invoiceStatus: fullyInvoiced ? "generated" : "partial",
          status: fullyInvoiced ? "Invoice Generated" : selectedOrder.status,
          updatedAt: Date.now(),
        })
      }

      // ✅ FIXED: Deduct Stock based on mode
      for (const item of lineItems) {
        if (mode === "order") {
          // ✅ For order mode: deduct from inventory table (okQty) in real-time
          await deductFromInventory(item)
        } else if (mode === "direct") {
          await deductFromFgStock(item)
        } else if (mode === "rawmaterial") {
          await deductFromRawMaterialStock(item)
        }
      }

      toast.success("Invoice saved & inventory updated")
      navigate("/sales/invoices")
    } catch (e: any) {
      console.error(e)
      toast.error("Save failed: " + (e.message || "Error"))
    }
  }

  // Handle Download PDF
  const handleDownloadPdf = async () => {
    if (!printRef.current) return;

    try {
      const toastId = toast.loading("Generating PDF...");
      // "l" for landscape
      const pdf = new jsPDF("l", "mm", "a4");

      // Select all individual pages inside the printRef
      const pages = printRef.current.querySelectorAll('.invoice-page');

      if (!pages || pages.length === 0) throw new Error("No pages found");

      for (let i = 0; i < pages.length; i++) {
        const canvas = await html2canvas(pages[i] as HTMLElement, {
          scale: 2, // High resolution
          useCORS: true,
          logging: false,
          backgroundColor: "#ffffff",
          windowWidth: 1123, // Force exact landscape width to prevent squishing
        });

        const imgData = canvas.toDataURL("image/jpeg", 1.0);

        if (i > 0) pdf.addPage();
        // A4 landscape is exactly 297mm x 210mm
        pdf.addImage(imgData, "JPEG", 0, 0, 297, 210);
      }

      pdf.save(`${invoiceNumber || "Invoice"}.pdf`);
      toast.dismiss(toastId);
      toast.success("PDF downloaded successfully");
    } catch (err) {
      console.error("PDF generation error:", err);
      toast.dismiss();
      toast.error("PDF generation failed");
    }
  };

  // In order mode selectedCustomer may be null; fall back to looking up the customer by order's name/id
  const orderCustomer = selectedOrder
    ? customers.find((c: any) => c.companyName === selectedOrder.customerName || c.id === selectedOrder.customerId)
    : null
  const resolvedCustomer = selectedCustomer || orderCustomer

  const billingAddress =
    quotation?.billingAddress || resolvedCustomer?.addresses?.find((a: any) => a.type === "billing")
  const shippingAddress =
    quotation?.shippingAddress ||
    resolvedCustomer?.addresses?.find((a: any) => a.type === "shipping")

  if (loadingInvoice) {
    return (
      <div className="min-h-screen flex items-center justify-center text-xl font-medium">
        Loading invoice...
      </div>
    )
  }

  // ── 8/12 pagination with footer-alone prevention ──────────────────────────
  const buildPages = (items: LineItem[]): LineItem[][] => {
    if (items.length === 0) return [[]]
    const result: LineItem[][] = []
    result.push(items.slice(0, ITEMS_FIRST_PAGE))
    let rest = items.slice(ITEMS_FIRST_PAGE)
    while (rest.length > 0) {
      result.push(rest.slice(0, ITEMS_OTHER_PAGES))
      rest = rest.slice(ITEMS_OTHER_PAGES)
    }
    // Footer-alone guard: last page must have ≥ 1 item
    // (only an issue if items.length === 0 — handled above)
    // But guard against perfectly-even splits where last page is empty:
    const last = result[result.length - 1]
    if (last.length === 0 && result.length > 1) {
      const prev = result[result.length - 2]
      const moved = prev.pop()!
      result[result.length - 1] = [moved]
    }
    return result
  }
  const pages = buildPages(lineItems)
  const totalPages = pages.length

  const CompanyHeader = (
    <div style={{ display: "flex", alignItems: "center", borderBottom: "2px solid #000", padding: "10px", background: "#fff" }}>
      <img src={fas} width="90" alt="Logo" style={{ marginLeft: "5px" }} />
      <div style={{ width: "80%", textAlign: "center" as const }}>
        <h1 style={{ margin: 0, fontSize: "22px", fontWeight: "bold" }}>Fluoro Automation Seals Pvt Ltd</h1>
        <p style={{ margin: "2px 0", fontSize: "12px" }}>3/180, Rajiv Gandhi Road, Mettukuppam,</p>
        <p style={{ margin: "2px 0", fontSize: "12px" }}>Chennai, Tamil Nadu - 600097</p>
        <p style={{ margin: "2px 0", fontSize: "12px" }}>Phone: +91-9841175097 | Email: fas@fluoroautomationseals.com</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 py-4">
      <div className="max-w-full mx-auto px-4">
        {/* HEADER */}
        <div className="flex flex-wrap gap-4 justify-between items-center mb-6">
          <Button variant="ghost" onClick={() => navigate("/sales/invoices")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          <h1 className="text-3xl font-bold text-blue-900">
            {isEditMode ? "Edit Invoice" : "Create New Invoice"}
          </h1>

          <div className="flex gap-3">
            <Button variant="secondary" onClick={handleDownloadPdf}>
              <Download className="w-4 h-4 mr-2" />
              Download PDF
            </Button>
            <Button onClick={handleSave} className="bg-blue-700 hover:bg-blue-800 px-8">
              {isEditMode ? "Update Invoice" : "Generate Invoice"}
            </Button>
          </div>
        </div>

        {/* TABS */}
        <Tabs value={mode} onValueChange={(v) => setMode(v as any)} className="mb-4">
          <TabsList className="grid w-full max-w-3xl grid-cols-3">
            <TabsTrigger value="order">From Sales Order</TabsTrigger>
            {/* <TabsTrigger value="direct">Direct Sale (FG Stock)</TabsTrigger> */}
            <TabsTrigger value="rawmaterial">Direct Sale (Raw Material)</TabsTrigger>
          </TabsList>

          {/* FROM ORDER tab — searchable order dropdown */}
          <TabsContent value="order" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Select Sales Order (QC Completed / Production Completed)</CardTitle>
              </CardHeader>
              <CardContent>
                {/* Searchable Order Combobox */}
                <div className="relative" ref={orderDropdownRef}>
                  <div
                    className={`flex items-center border rounded-md px-3 h-10 cursor-pointer bg-white ${
                      isEditMode ? 'opacity-60 pointer-events-none' : 'hover:border-blue-400'
                    }`}
                    onClick={() => !isEditMode && setOrderDropdownOpen((p) => !p)}
                  >
                    <span className="flex-1 text-sm truncate">
                      {selectedOrder
                        ? `${selectedOrder.soNumber} – ${selectedOrder.customerName}`
                        : 'Select order...'}
                    </span>
                    <svg className="h-4 w-4 text-gray-400 ml-2 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                  {orderDropdownOpen && !isEditMode && (
                    <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg">
                      <div className="p-2 border-b">
                        <input
                          autoFocus
                          className="w-full text-sm border rounded px-2 py-1 outline-none focus:ring-2 focus:ring-blue-400"
                          placeholder="Search by SO number or customer..."
                          value={orderSearch}
                          onChange={(e) => setOrderSearch(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <ul className="max-h-60 overflow-y-auto">
                        {orders
                          .filter((o) => {
                            const q = orderSearch.toLowerCase()
                            return (
                              (o.soNumber || '').toLowerCase().includes(q) ||
                              (o.customerName || '').toLowerCase().includes(q)
                            )
                          })
                          .map((o) => (
                            <li
                              key={o.id}
                              className="px-3 py-2 text-sm cursor-pointer hover:bg-blue-50"
                              onClick={() => handleOrderChange(o.id)}
                            >
                              <span className="font-semibold">{o.soNumber}</span>
                              <span className="text-gray-500 ml-2">{o.customerName} ({o.currency}) – {o.status}</span>
                            </li>
                          ))}
                        {orders.filter((o) => {
                          const q = orderSearch.toLowerCase()
                          return (o.soNumber || '').toLowerCase().includes(q) || (o.customerName || '').toLowerCase().includes(q)
                        }).length === 0 && (
                          <li className="px-3 py-3 text-sm text-gray-400 text-center">No orders match</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>

                {orders.length === 0 && (
                  <p className="text-sm text-muted-foreground mt-2">
                    No eligible orders. Orders with QC Completed or Production Completed status are shown.
                  </p>
                )}

                {/* Inventory load feedback */}
                {selectedOrder && lineItems.length > 0 && (
                  <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded text-sm text-green-800">
                    ✅ <strong>{lineItems.length} item(s)</strong> loaded from Inventory table. Rate sourced from <code>unitRate</code>. Available qty = <code>okQty</code>.
                  </div>
                )}
                {selectedOrder && lineItems.length === 0 && (
                  <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                    ⚠️ No inventory records with OK qty found for this order.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* DIRECT SALE FROM FG STOCK */}
          <TabsContent value="direct" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Select Customer</CardTitle>
              </CardHeader>
              <CardContent>
                <Select
                  value={selectedCustomer?.id || ""}
                  onValueChange={(v) => {
                    const cust = customers.find((c) => c.id === v)
                    setSelectedCustomer(cust || null)
                    setLineItems([])
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose customer..." />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.companyName} ({c.customerCode})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {selectedCustomer && (
              <Card>
                <CardHeader>
                  <CardTitle>Add Products from Finished Goods Stock</CardTitle>
                </CardHeader>
                <CardContent>
                  <Select onValueChange={addFgItem}>
                    <SelectTrigger>
                      <SelectValue placeholder="Search FG product..." />
                    </SelectTrigger>
                    <SelectContent>
                      {allProductItems
                        .filter(
                          (item) =>
                            (item.type === "FINISHED GOODS" || item.type === "SEMI FINISHED GOODS") &&
                            !lineItems.some((li) => li.partCode === item.productCode)
                        )
                        .map((item) => {
                          const code = item.productCode
                          const fg = fgStock.filter(
                            (f: any) => f.productCode === code && f.qc === "ok"
                          )
                          const total = fg.reduce((s: number, f: any) => s + Number(f.quantity), 0)
                          if (total === 0) return null
                          return (
                            <SelectItem key={code} value={code}>
                              {code} - {item.category} - {item.group} ({total} {item.unit || "NOS"}{" "}
                              available)
                            </SelectItem>
                          )
                        })
                        .filter(Boolean)}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* DIRECT SALE FROM RAW MATERIAL — searchable customer + product */}
          <TabsContent value="rawmaterial" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Select Customer</CardTitle>
              </CardHeader>
              <CardContent>
                {/* Searchable Customer Combobox */}
                <div className="relative" ref={rawCustDropdownRef}>
                  <div
                    className="flex items-center border rounded-md px-3 h-10 cursor-pointer bg-white hover:border-blue-400"
                    onClick={() => setRawCustOpen((p) => !p)}
                  >
                    <span className="flex-1 text-sm truncate">
                      {selectedCustomer && mode === 'rawmaterial'
                        ? `${selectedCustomer.companyName} (${selectedCustomer.customerCode})`
                        : 'Choose customer...'}
                    </span>
                    <svg className="h-4 w-4 text-gray-400 ml-2 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                  {rawCustOpen && (
                    <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg">
                      <div className="p-2 border-b">
                        <input
                          autoFocus
                          className="w-full text-sm border rounded px-2 py-1 outline-none focus:ring-2 focus:ring-blue-400"
                          placeholder="Search by name or code..."
                          value={rawCustSearch}
                          onChange={(e) => setRawCustSearch(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <ul className="max-h-60 overflow-y-auto">
                        {customers
                          .filter((c) => {
                            const q = rawCustSearch.toLowerCase()
                            return (
                              (c.companyName || '').toLowerCase().includes(q) ||
                              (c.customerCode || '').toLowerCase().includes(q)
                            )
                          })
                          .map((c) => (
                            <li
                              key={c.id}
                              className="px-3 py-2 text-sm cursor-pointer hover:bg-blue-50"
                              onClick={() => {
                                setSelectedCustomer(c)
                                setLineItems([])
                                setRawCustOpen(false)
                                setRawCustSearch("")
                              }}
                            >
                              <span className="font-semibold">{c.companyName}</span>
                              <span className="text-gray-500 ml-2">({c.customerCode})</span>
                            </li>
                          ))}
                        {customers.filter((c) => {
                          const q = rawCustSearch.toLowerCase()
                          return (c.companyName || '').toLowerCase().includes(q) || (c.customerCode || '').toLowerCase().includes(q)
                        }).length === 0 && (
                          <li className="px-3 py-3 text-sm text-gray-400 text-center">No customers match</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {selectedCustomer && mode === 'rawmaterial' && (
              <Card>
                <CardHeader>
                  <CardTitle>Add Products from Raw Materials</CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Searchable Product Combobox */}
                  <div className="relative" ref={rawProdDropdownRef}>
                    <div
                      className="flex items-center border rounded-md px-3 h-10 cursor-pointer bg-white hover:border-blue-400"
                      onClick={() => setRawProdOpen((p) => !p)}
                    >
                      <span className="flex-1 text-sm text-gray-500">Search raw material product...</span>
                      <svg className="h-4 w-4 text-gray-400 ml-2 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                    {rawProdOpen && (
                      <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg">
                        <div className="p-2 border-b">
                          <input
                            autoFocus
                            className="w-full text-sm border rounded px-2 py-1 outline-none focus:ring-2 focus:ring-blue-400"
                            placeholder="Search by code or category..."
                            value={rawProdSearch}
                            onChange={(e) => setRawProdSearch(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <ul className="max-h-60 overflow-y-auto">
                          {allProductItems
                            .filter((item) => {
                              if (!item.productCode) return false
                              const q = rawProdSearch.toLowerCase()
                              return (
                                (item.productCode || '').toLowerCase().includes(q) ||
                                (item.category || '').toLowerCase().includes(q) ||
                                (item.group || '').toLowerCase().includes(q)
                              )
                            })
                            .map((item) => {
                              const stock = Number(item.stockQty || 0)
                              return (
                                <li
                                  key={item.productCode}
                                  className="px-3 py-2 text-sm cursor-pointer hover:bg-blue-50"
                                  onClick={() => {
                                    addRawMaterialItem(item.productCode)
                                    setRawProdOpen(false)
                                    setRawProdSearch("")
                                  }}
                                >
                                  <span className="font-semibold">{item.productCode}</span>
                                  <span className="text-gray-500 ml-2">{item.category || 'N/A'} – {item.group || 'N/A'}</span>
                                  <span className="text-green-600 ml-2">({stock} {item.unit || 'NOS'} avail.)</span>
                                </li>
                              )
                            })}
                          {allProductItems.filter((item) => {
                            if (!item.productCode) return false
                            const q = rawProdSearch.toLowerCase()
                            return (item.productCode || '').toLowerCase().includes(q) || (item.category || '').toLowerCase().includes(q) || (item.group || '').toLowerCase().includes(q)
                          }).length === 0 && (
                            <li className="px-3 py-3 text-sm text-gray-400 text-center">No products match</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* LINE ITEMS EDITOR */}
        {lineItems.length > 0 && (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Line Items Editor</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300 text-sm">
                  <thead className="bg-gray-200">
                    <tr>
                      <th className="border border-gray-300 p-2">#</th>
                      <th className="border border-gray-300 p-2">Part Code</th>
                      <th className="border border-gray-300 p-2">Description</th>
                      <th className="border border-gray-300 p-2">HSN</th>
                      <th className="border border-gray-300 p-2">Available</th>
                      <th className="border border-gray-300 p-2">Qty</th>
                      <th className="border border-gray-300 p-2">UOM</th>
                      <th className="border border-gray-300 p-2">Rate</th>
                      <th className="border border-gray-300 p-2">Amount</th>
                      <th className="border border-gray-300 p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item, i) => (
                      <tr key={i}>
                        <td className="border border-gray-300 p-2 text-center">{i + 1}</td>
                        <td className="border border-gray-300 p-2">{item.partCode}</td>
                        <td className="border border-gray-300 p-2">{item.description}</td>
                        <td className="border border-gray-300 p-2">
                          <Input
                            value={item.hsnCode}
                            onChange={(e) => updateItemField(i, "hsnCode", e.target.value)}
                            className="w-24"
                          />
                        </td>
                        <td className="border border-gray-300 p-2 text-center font-semibold">
                          {item.availableStock}
                        </td>
                        <td className="border border-gray-300 p-2">
                          <Input
                            type="number"
                            value={item.invoicedQty}
                            onChange={(e) => updateQty(i, Number(e.target.value))}
                            min={0}
                            max={item.availableStock}
                            className="w-20"
                          />
                        </td>
                        <td className="border border-gray-300 p-2">
                          <Input
                            value={item.uom}
                            onChange={(e) => updateItemField(i, "uom", e.target.value)}
                            className="w-20"
                          />
                        </td>
                        <td className="border border-gray-300 p-2">
                          <Input
                            type="number"
                            value={item.rate}
                            onChange={(e) => updateItemField(i, "rate", Number(e.target.value))}
                            min={0}
                            step={0.01}
                            className="w-24"
                          />
                        </td>
                        <td className="border border-gray-300 p-2 text-right font-semibold">
                          {symbol}{formatAmount(item.amount)}
                        </td>
                        <td className="border border-gray-300 p-2 text-center">
                          <Button variant="destructive" size="sm" onClick={() => removeItem(i)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded">
                <p className="text-sm text-blue-900">
                  <strong>Note:</strong> Tax percentages (CGST, SGST, IGST) are controlled globally
                  in the GST Configuration section below. Discount is not editable per item.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* INVOICE DETAILS */}
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Invoice Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Invoice No.</Label>
                <Input value={invoiceNumber} readOnly className="bg-gray-100 font-bold" />
              </div>
              <div>
                <Label>Invoice Date</Label>
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </div>
              <div>
                <Label>Date & Time of Supply</Label>
                <Input
                  type="datetime-local"
                  value={dateTimeOfSupply}
                  onChange={(e) => setDateTimeOfSupply(e.target.value)}
                />
              </div>

              <div>
                <Label>Place of Supply</Label>
                <Input value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)} />
              </div>

              <div>
                <Label>Payment Terms</Label>
                <Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
              </div>

              {/* ── Transporter Details ── */}
              <div>
                <Label>Transporter Name</Label>
                <Input
                  value={transporterName}
                  onChange={(e) => setTransporterName(e.target.value)}
                  placeholder="Enter transporter name"
                />
              </div>

              <div>
                <Label>Transport Mode</Label>
                <Input
                  value={transportMode}
                  onChange={(e) => setTransportMode(e.target.value)}
                  placeholder="e.g. Courier, Road, Air"
                />
              </div>

              <div>
                <Label>Vehicle No.</Label>
                <Input
                  value={vehicleNo}
                  onChange={(e) => setVehicleNo(e.target.value)}
                  placeholder="Enter vehicle number"
                />
              </div>

              <div>
                <Label>E-Way Bill No.</Label>
                <Input
                  value={eWayBillNo}
                  onChange={(e) => setEWayBillNo(e.target.value)}
                  placeholder="Enter E-Way Bill Number"
                />
              </div>

              <div>
                <Label>E-Way Bill Date</Label>
                <Input
                  type="date"
                  value={eWayBillDate}
                  onChange={(e) => setEWayBillDate(e.target.value)}
                />
              </div>

              <div className="md:col-span-3">
                <Label>Terms & Conditions</Label>
                <Textarea
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  placeholder="Enter terms and conditions..."
                  rows={2}
                />
              </div>
            </div>

            <div>
              <Label>Remarks</Label>
              <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
            </div>
          </CardContent>
        </Card>

        {/* TRANSPORT CHARGE */}
        <Card className="bg-blue-50 border-2 border-blue-200 mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Transport Charge</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={transportChargeType === "fixed"}
                  onChange={() => setTransportChargeType("fixed")}
                  className="w-4 h-4"
                />
                Fixed Amount
              </Label>
              <Label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={transportChargeType === "percent"}
                  onChange={() => setTransportChargeType("percent")}
                  className="w-4 h-4"
                />
                Percentage
              </Label>
            </div>

            {transportChargeType === "fixed" ? (
              <div>
                <Label>Fixed Transport Charge ({symbol})</Label>
                <Input
                  type="number"
                  value={transportCharge}
                  onChange={(e) => setTransportCharge(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Enter fixed amount"
                />
              </div>
            ) : (
              <div>
                <Label>Transport Charge Percentage (%)</Label>
                <Input
                  type="number"
                  value={transportChargePercent}
                  onChange={(e) => setTransportChargePercent(e.target.value === '' ? '' : Number(e.target.value))}
                  min={0}
                  max={100}
                  step={0.1}
                  placeholder="Enter percentage"
                />
              </div>
            )}

            <div className="text-sm font-medium text-blue-800">
              Calculated Transport Charge: {symbol}
              {formatAmount(calculatedTransportCharge)}
            </div>
          </CardContent>
        </Card>

        {/* GST CONFIGURATION */}
        <Card className="bg-green-50 border-2 border-green-200 mb-4">
          <CardHeader>
            <CardTitle className="text-lg">GST Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="applyCGST"
                    checked={applyCGST}
                    onChange={(e) => setApplyCGST(e.target.checked)}
                    className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <Label htmlFor="applyCGST" className="cursor-pointer text-base font-bold">
                    Apply CGST
                  </Label>
                </div>
                <div>
                  <Label>CGST Percentage (%)</Label>
                  <Input
                    type="number"
                    value={cgstPercent}
                    onChange={(e) => setCgstPercent(e.target.value === '' ? '' : Number(e.target.value))}
                    min={0}
                    step={0.1}
                    disabled={!applyCGST}
                    className="font-bold"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="applySGST"
                    checked={applySGST}
                    onChange={(e) => setApplySGST(e.target.checked)}
                    className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <Label htmlFor="applySGST" className="cursor-pointer text-base font-bold">
                    Apply SGST
                  </Label>
                </div>
                <div>
                  <Label>SGST Percentage (%)</Label>
                  <Input
                    type="number"
                    value={sgstPercent}
                    onChange={(e) => setSgstPercent(e.target.value === '' ? '' : Number(e.target.value))}
                    min={0}
                    step={0.1}
                    disabled={!applySGST}
                    className="font-bold"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="applyIGST"
                    checked={applyIGST}
                    onChange={(e) => setApplyIGST(e.target.checked)}
                    className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <Label htmlFor="applyIGST" className="cursor-pointer text-base font-bold">
                    Apply IGST
                  </Label>
                </div>
                <div>
                  <Label>IGST Percentage (%)</Label>
                  <Input
                    type="number"
                    value={igstPercent}
                    onChange={(e) => setIgstPercent(e.target.value === '' ? '' : Number(e.target.value))}
                    min={0}
                    step={0.1}
                    disabled={!applyIGST}
                    className="font-bold"
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 p-4 bg-white border-2 border-green-300 rounded">
              <h3 className="font-bold text-lg mb-2">Live Tax Calculation Preview</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Items Total:</span>
                  <div className="font-bold text-lg">
                    {symbol}
                    {formatAmount(lineItems.reduce((s, i) => s + i.taxableValue, 0))}
                  </div>
                </div>
                <div>
                  <span className="text-gray-600">Transport:</span>
                  <div className="font-bold text-lg">
                    {symbol}
                    {formatAmount(calculatedTransportCharge)}
                  </div>
                </div>
                <div>
                  <span className="text-gray-600">Taxable Amount:</span>
                  <div className="font-bold text-lg">
                    {symbol}
                    {formatAmount(taxable)}
                  </div>
                </div>
                <div>
                  <span className="text-gray-600">Grand Total:</span>
                  <div className="font-bold text-xl text-green-700">
                    {symbol}
                    {formatAmount(total)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mt-3 pt-3 border-t">
                {applyCGST && (
                  <div className="bg-blue-50 p-2 rounded">
                    <span className="text-gray-600 text-xs">CGST ({cgstPercent}%)</span>
                    <div className="font-bold text-blue-700">
                      {symbol}
                      {formatAmount(cgst)}
                    </div>
                  </div>
                )}
                {applySGST && (
                  <div className="bg-blue-50 p-2 rounded">
                    <span className="text-gray-600 text-xs">SGST ({sgstPercent}%)</span>
                    <div className="font-bold text-blue-700">
                      {symbol}
                      {formatAmount(sgst)}
                    </div>
                  </div>
                )}
                {applyIGST && (
                  <div className="bg-blue-50 p-2 rounded">
                    <span className="text-gray-600 text-xs">IGST ({igstPercent}%)</span>
                    <div className="font-bold text-blue-700">
                      {symbol}
                      {formatAmount(igst)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* MULTI-PAGE PDF PREVIEW */}
        <style>
          {`
            @media print {
              @page { size: A4 landscape; margin: 0; }
              body { print-color-adjust: exact; -webkit-print-color-adjust: exact; margin: 0; padding: 0; }
              .page-break { page-break-after: always; break-after: page; }
            }
            .invoice-table { width: 100%; border-collapse: collapse; table-layout: fixed; }            
            .invoice-table td, .invoice-table th {
            border: 1.5px solid #000;
            padding: 2px 4px; /* Reduced from 3px to 2px */
            vertical-align: middle;
            font-size: 10px;  /* Reduced from 11px to 10px to fit 12 rows */
            line-height: 1.2;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }
            .invoice-table th {
              background: #e5e7eb;
              font-weight: 900;
              text-align: center;
            }
          `}
        </style>
        <div className="w-full overflow-x-auto pb-8 flex justify-center bg-gray-200 p-4 rounded-lg">
          <div ref={printRef} style={{ width: "1123px", minWidth: "1123px", flexShrink: 0 }}>
            {pages.map((pageItems, pageIndex) => {
              const isLastPage = pageIndex === totalPages - 1;
              const offset = pageIndex === 0
                ? 0
                : ITEMS_FIRST_PAGE + (pageIndex - 1) * ITEMS_OTHER_PAGES;

              return (
                <div
                  key={pageIndex}
                  // ADDED 'invoice-page' class here so html2canvas captures each page separately
                  className={`invoice-page ${!isLastPage ? "page-break" : ""}`}
                  style={{
                    width: "1123px",
                    height: "794px",
                    maxHeight: "794px",
                    background: "#ffffff",
                    margin: "0 auto 40px",
                    padding: 0,
                    fontFamily: "Arial, sans-serif",
                    color: "#000",
                    position: "relative",
                    boxSizing: "border-box",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      border: "2.5px solid #000",
                      height: "100%",
                      maxHeight: "100%",
                      display: "flex",
                      flexDirection: "column",
                      overflow: "hidden",
                    }}
                  >
                    {/* ── Company Header ── */}
                    <div style={{ flexShrink: 0 }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '6px 14px', borderBottom: '2.5px solid #000',
                        background: '#ffffff', gap: '10px',
                      }}>
                        <img src={fas} alt="FAS Logo" style={{ width: '80px', height: 'auto', flexShrink: 0 }} />
                        <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
                          <h1 style={{
                            fontSize: '20px', fontWeight: '800', margin: 0, letterSpacing: '0.5px', color: '#000',
                            lineHeight: 1.2, whiteSpace: 'normal',
                          }}>
                            Fluoro Automation Seals Pvt Ltd
                          </h1>
                          <p style={{ fontSize: '11px', margin: '2px 0 0 0', color: '#000', lineHeight: 1.4, fontWeight: '600' }}>
                            3/180, Rajiv Gandhi Road, Mettukuppam, Chennai Tamil Nadu 600097 India<br />
                            Phone: +91-9841175097 | Email: fas@fluoroautomationseals.com
                          </p>
                        </div>
                        <div style={{ width: '80px' }}></div>
                      </div>

                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '4px 14px', background: '#e5e7eb', borderBottom: '2.5px solid #000',
                        fontSize: '11px', fontWeight: '800', gap: '40px', flexWrap: 'nowrap', overflow: 'hidden',
                      }}>
                        <div style={{ display: 'flex', gap: '4px' }}><span style={{ fontWeight: '900' }}>GSTIN:</span><span>33AAECF2716M1ZO</span></div>
                        <div style={{ display: 'flex', gap: '4px' }}><span style={{ fontWeight: '900' }}>PAN:</span><span>AAECF2716M</span></div>
                        <div style={{ display: 'flex', gap: '4px' }}><span style={{ fontWeight: '900' }}>CIN:</span><span>U25209TN2020PTC138498</span></div>
                      </div>
                    </div>

                    {/* ── Page Body ── */}
                    <div style={{ flex: 1, padding: "6px 14px 10px 14px", display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>

                      {/* Page 1: Title + Customer Block */}
                      {pageIndex === 0 && (
                        <>
                          <h2 style={{ textAlign: 'center', fontSize: '16px', fontWeight: '900', margin: '0 0 5px 0', letterSpacing: '1.5px', flexShrink: 0 }}>
                            TAX INVOICE
                          </h2>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.1fr', gap: '8px', fontSize: '11px', marginBottom: '15px', flexShrink: 0 }}>
                            {/* Bill To */}
                            <div style={{ overflow: 'hidden' }}>
                              <p style={{ fontWeight: '900', fontSize: '11px', textDecoration: 'underline', margin: '0 0 2px 0' }}>Bill To:</p>
                              <p style={{ fontWeight: '900', fontSize: '11px', margin: '0 0 2px 0', wordBreak: 'break-word' }}>
                                {selectedOrder?.customerName || selectedCustomer?.companyName || '—'}
                              </p>
                              <p style={{ whiteSpace: 'pre-line', fontSize: '11px', lineHeight: 1.35, margin: '0 0 2px 0', fontWeight: '600', wordBreak: 'break-word' }}>
                                {getFormattedCustomerAddress(selectedCustomer, billingAddress, 'billing')}
                              </p>
                            </div>

                            {/* Ship To */}
                            <div style={{ overflow: 'hidden' }}>
                              <p style={{ fontWeight: '900', fontSize: '11px', textDecoration: 'underline', margin: '0 0 2px 0' }}>Ship To:</p>
                              <p style={{ fontSize: '11px', lineHeight: 1.35, whiteSpace: 'pre-line', fontWeight: '600', margin: 0, wordBreak: 'break-word' }}>
                                {getFormattedCustomerAddress(selectedCustomer, shippingAddress || billingAddress, 'shipping')}
                              </p>
                              <p style={{ marginTop: '4px', fontSize: '11px', fontWeight: '700' }}>
                                <strong>Place of Supply:</strong> {placeOfSupply}
                              </p>
                            </div>

                            {/* Invoice Details */}
                            <div>
                              <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                                <colgroup>
                                  <col style={{ width: '48%' }} />
                                  <col style={{ width: '52%' }} />
                                </colgroup>
                                <tbody>
                                  {[
                                    ['Invoice No.:', invoiceNumber, '12px'],
                                    ['Invoice Date:', invoiceDate ? format(new Date(invoiceDate), "dd/MM/yyyy") : '—', null],
                                    ['Payment Terms:', paymentTerms, null],
                                    ['Transporter:', transporterName || '—', null],
                                    ['E-Way Bill No.:', eWayBillNo || '—', null],
                                    ['Cust PO No.:', customerPONo || '—', null],
                                    ['Cust PO Date:', customerPODate ? format(new Date(customerPODate), "dd/MM/yyyy") : '—', null],
                                  ].map(([label, value, fs]) => (
                                    <tr key={label}>
                                      <td style={{ paddingRight: '6px', paddingTop: '2px', paddingBottom: '2px', verticalAlign: 'top', fontWeight: '700', fontSize: '11px', lineHeight: '1.2' }}>
                                        {label}
                                      </td>
                                      <td style={{ fontWeight: fs ? '900' : '800', paddingTop: '2px', paddingBottom: '2px', fontSize: fs || '11px', wordBreak: 'break-word', lineHeight: '1.2' }}>
                                        {value}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </>
                      )}

                      {/* Pages 2+: Continuation Header */}
                      {pageIndex > 0 && (
                        <div style={{ marginBottom: '6px', paddingTop: '4px', flexShrink: 0, textAlign: 'center' }}>
                          <h3 style={{ fontSize: '12px', fontWeight: '900', marginBottom: '2px' }}>
                            TAX INVOICE — {invoiceNumber} (Continued)
                          </h3>
                          <p style={{ fontSize: '11px', color: '#555' }}>
                            Page {pageIndex + 1} of {totalPages}
                          </p>
                        </div>
                      )}

                      {/* ── Items Table (Updated to match Quotation UI) ── */}
                      <div style={{ flexShrink: 0, marginBottom: isLastPage ? '8px' : '0' }}>
                        <table className="invoice-table">
                          <colgroup>
                            <col style={{ width: '4%' }} />
                            <col style={{ width: '14%' }} />
                            <col style={{ width: '31%' }} />
                            <col style={{ width: '9%' }} />
                            <col style={{ width: '6%' }} />
                            <col style={{ width: '6%' }} />
                            <col style={{ width: '8%' }} />
                            <col style={{ width: '9%' }} />
                            <col style={{ width: '5%' }} />
                            <col style={{ width: '8%' }} />
                          </colgroup>
                          <thead>
                            <tr>
                              <th>Sr.</th>
                              <th>SKU / Code</th>
                              <th>Description</th>
                              <th>HSN</th>
                              <th>UOM</th>
                              <th>Qty</th>
                              <th>Rate<br />({symbol})</th>
                              <th>Amount<br />({symbol})</th>
                              <th>Disc<br />%</th>
                              <th>Net<br />({symbol})</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pageItems.map((item, i) => (
                              <tr key={i}>
                                <td style={{ textAlign: 'center', fontWeight: '800' }}>{offset + i + 1}</td>
                                <td style={{ fontWeight: '800', textAlign: 'center' }}>{item.partCode}</td>
                                <td style={{ fontWeight: '700' }}>
                                  <div style={{ display: 'block', lineHeight: '1.4' }}>
                                    {item.description}
                                  </div>
                                </td>
                                <td style={{ textAlign: 'center', fontWeight: '700' }}>{item.hsnCode}</td>
                                <td style={{ textAlign: 'center', fontWeight: '700' }}>{item.uom}</td>
                                <td style={{ textAlign: 'center', fontWeight: '800' }}>{Number(item.invoicedQty).toFixed(2)}</td>
                                <td style={{ textAlign: 'right', fontWeight: '700' }}>{formatAmount(item.rate)}</td>
                                <td style={{ textAlign: 'right', fontWeight: '800' }}>{formatAmount(item.invoicedQty * item.rate)}</td>
                                <td style={{ textAlign: 'center', fontWeight: '700' }}>{formatAmount(item.discount || 0)}</td>
                                <td style={{ textAlign: 'right', fontWeight: '900', background: '#f9fafb' }}>{formatAmount(item.taxableValue)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* ── Footer (last page only) ── */}
                      {isLastPage && (
                        <div style={{
                          display: 'grid', gridTemplateColumns: '1fr 1fr',
                          gap: '10px', flexShrink: 0, marginTop: 'auto',
                          paddingBottom: '15px'
                        }}>
                          {/* LEFT: Remarks + Bank Details + Terms */}
                          <div style={{ fontSize: '11px', borderTop: '2px solid #000', paddingTop: '5px', overflow: 'hidden' }}>
                            <p style={{ lineHeight: 1.4, margin: '0 0 2px 0', fontWeight: '700', wordBreak: 'break-word' }}>
                              <strong style={{ fontWeight: '900' }}>Remarks:</strong> {remarks || 'None'}
                            </p>
                            <p style={{ fontStyle: 'italic', fontSize: '11px', fontWeight: '700', margin: '0 0 5px 0', wordBreak: 'break-word' }}>
                              <strong>Amount in Words:</strong> {amountInWords}
                            </p>

                            {/* Bank Details */}
                            <div style={{ fontSize: '11px', marginBottom: '8px' }}>
                              <p style={{ margin: '0 0 2px 0', fontWeight: '900' }}>Company's Bank Details:</p>
                              <table style={{ borderCollapse: 'collapse', fontSize: '11px' }}>
                                <tbody>
                                  {[
                                    ['Bank Name', bankDetails.bankName],
                                    ['A/c No.', bankDetails.accountNo],
                                    ['IFSC Code', bankDetails.ifscCode],
                                    ['Bank Branch', bankDetails.branch],
                                  ].map(([k, v]) => (
                                    <tr key={k}>
                                      <td style={{ paddingRight: '6px', width: '76px', fontWeight: '700' }}>{k}</td>
                                      <td style={{ padding: '0 3px', fontWeight: '600' }}>:</td>
                                      <td style={{ fontWeight: '700' }}>{v}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            <div style={{ fontSize: '10px', borderTop: '1px solid #e5e7eb', paddingTop: '4px' }}>
                              <p style={{ margin: '0 0 2px 0', fontWeight: '900' }}>Terms & Conditions:</p>
                              <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.3, margin: 0, fontWeight: '600' }}>{terms}</p>
                            </div>
                          </div>

                          {/* RIGHT: Totals + Signature */}
                          <div style={{ borderTop: '2px solid #000', paddingTop: '5px', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>

                            {/* Totals Section */}
                            <table style={{ marginLeft: 'auto', fontSize: '11px', width: '100%' }}>
                              <tbody>
                                <tr>
                                  <td style={{ paddingRight: '10px', paddingTop: '2px', paddingBottom: '2px', textAlign: 'right', fontWeight: '800' }}>Subtotal</td>
                                  <td style={{ fontWeight: '900', paddingLeft: '10px', width: '90px', textAlign: 'right', paddingTop: '2px', paddingBottom: '2px' }}>{symbol}{formatAmount(taxable)}</td>
                                </tr>
                                {applyCGST && cgst > 0 && (
                                  <tr>
                                    <td style={{ paddingRight: '10px', paddingTop: '2px', paddingBottom: '2px', textAlign: 'right', fontWeight: '800' }}>CGST @{cgstPercent}%</td>
                                    <td style={{ fontWeight: '900', paddingLeft: '10px', textAlign: 'right', paddingTop: '2px', paddingBottom: '2px' }}>{symbol}{formatAmount(cgst)}</td>
                                  </tr>
                                )}
                                {applySGST && sgst > 0 && (
                                  <tr>
                                    <td style={{ paddingRight: '10px', paddingTop: '2px', paddingBottom: '2px', textAlign: 'right', fontWeight: '800' }}>SGST @{sgstPercent}%</td>
                                    <td style={{ fontWeight: '900', paddingLeft: '10px', textAlign: 'right', paddingTop: '2px', paddingBottom: '2px' }}>{symbol}{formatAmount(sgst)}</td>
                                  </tr>
                                )}
                                {applyIGST && igst > 0 && (
                                  <tr>
                                    <td style={{ paddingRight: '10px', paddingTop: '2px', paddingBottom: '2px', textAlign: 'right', fontWeight: '800' }}>IGST @{igstPercent}%</td>
                                    <td style={{ fontWeight: '900', paddingLeft: '10px', textAlign: 'right', paddingTop: '2px', paddingBottom: '2px' }}>{symbol}{formatAmount(igst)}</td>
                                  </tr>
                                )}
                                {calculatedTransportCharge > 0 && (
                                  <tr>
                                    <td style={{ paddingRight: '10px', paddingTop: '2px', paddingBottom: '2px', textAlign: 'right', fontWeight: '800' }}>Transport Charge</td>
                                    <td style={{ fontWeight: '900', paddingLeft: '10px', textAlign: 'right', paddingTop: '2px', paddingBottom: '2px' }}>{symbol}{formatAmount(calculatedTransportCharge)}</td>
                                  </tr>
                                )}
                                <tr>
                                  <td style={{ paddingRight: '10px', paddingTop: '2px', paddingBottom: '2px', textAlign: 'right', fontWeight: '800' }}>Round Off</td>
                                  <td style={{ fontWeight: '900', paddingLeft: '10px', textAlign: 'right', paddingTop: '2px', paddingBottom: '2px' }}>{symbol}{formatAmount(Math.round(total) - total)}</td>
                                </tr>
                                <tr style={{ borderTop: '2px solid #000' }}>
                                  <td style={{ paddingRight: '10px', paddingTop: '4px', paddingBottom: '4px', fontSize: '12px', fontWeight: '900', textAlign: 'right' }}>
                                    Total Amount ({currency})
                                  </td>
                                  <td style={{ fontSize: '13px', fontWeight: '900', paddingLeft: '10px', textAlign: 'right', paddingTop: '4px', paddingBottom: '4px' }}>
                                    {symbol}{formatAmount(Math.round(total))}
                                  </td>
                                </tr>
                              </tbody>
                            </table>

                            {/* Signature — pinned right */}
                            <div style={{ marginTop: '10px', textAlign: 'right' }}>
                              <p style={{ fontWeight: '900', fontSize: '11px', marginBottom: '26px' }}>
                                For Fluoro Automation Seals Pvt Ltd
                              </p>
                              <div style={{ borderTop: '1.5px solid #000', width: '160px', paddingTop: '4px', marginLeft: 'auto', marginBottom: '10px' }}>
                                <p style={{ fontWeight: '900', fontSize: '11px' }}>Authorised Signatory</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}