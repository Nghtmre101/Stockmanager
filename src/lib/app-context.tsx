import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { applyTheme, generateTheme, type GeneratedTheme } from "./theme";

export type Lang = "ar" | "fr" | "en";

type Entry = { ar: string; fr: string; en: string };

const dict = {
  appName: { ar: "مدير المبيعات", fr: "Stock Manager", en: "Stock Manager" },
  tagline: {
    ar: "نظام إدارة المحل والمخزون",
    fr: "Gestion de magasin et de stock",
    en: "Store & inventory management",
  },
  nav_home: { ar: "الرئيسية", fr: "Accueil", en: "Home" },
  nav_pos: { ar: "البيع", fr: "Caisse", en: "Point of sale" },
  nav_purchases: { ar: "المشتريات", fr: "Achats", en: "Purchases" },
  nav_cashbox: { ar: "الصندوق", fr: "Caisse du jour", en: "Cashbox" },
  nav_sales_history: { ar: "سجل المبيعات", fr: "Historique des ventes", en: "Sales history" },
  nav_refunds: { ar: "الإرجاع", fr: "Retours", en: "Refunds" },
  nav_staff: { ar: "العمال", fr: "Personnel", en: "Staff" },
  nav_summary: { ar: "الملخص المالي", fr: "Finances", en: "Financials" },
  nav_products: { ar: "المواد", fr: "Articles", en: "Items" },
  nav_categories: { ar: "الأصناف", fr: "Catégories", en: "Categories" },
  nav_customers: { ar: "الزبائن", fr: "Clients", en: "Customers" },
  nav_suppliers: { ar: "الممونين", fr: "Fournisseurs", en: "Suppliers" },
  nav_settings: { ar: "الإعدادات", fr: "Paramètres", en: "Settings" },
  nav_more: { ar: "المزيد", fr: "Plus", en: "More" },
  theme_btn: { ar: "ثيم عشوائي", fr: "Thème aléatoire", en: "Random theme" },
  lang_btn: { ar: "العربية", fr: "Français", en: "English" },
  today_sales: { ar: "مبيعات اليوم", fr: "Ventes du jour", en: "Today's sales" },
  month_sales: { ar: "مبيعات هذا الشهر", fr: "Ventes du mois", en: "This month's sales" },
  year_sales: { ar: "مبيعات هذه السنة", fr: "Ventes de l'année", en: "This year's sales" },
  expenses: { ar: "مصاريف", fr: "Dépenses", en: "Expenses" },
  debts: { ar: "ديون الزبائن", fr: "Créances clients", en: "Customer debts" },
  net_profit: { ar: "صافي الربح", fr: "Bénéfice net", en: "Net profit" },
  total_sales: { ar: "إجمالي المبيعات", fr: "Total des ventes", en: "Total sales" },
  total_expenses: { ar: "إجمالي المصاريف", fr: "Total des dépenses", en: "Total expenses" },
  losses: { ar: "خسائر التالف", fr: "Pertes / casse", en: "Damage losses" },
  vs_prev: { ar: "مقارنة بالفترة السابقة", fr: "vs période précédente", en: "vs previous period" },
  last30: { ar: "آخر 30 يوم", fr: "30 derniers jours", en: "Last 30 days" },
  last7: { ar: "مبيعات آخر 7 أيام", fr: "Ventes des 7 derniers jours", en: "Sales — last 7 days" },
  daily_profit: { ar: "حركة صافي الربح اليومي", fr: "Bénéfice net journalier", en: "Daily net profit" },
  shortcuts: { ar: "الاختصارات", fr: "Raccourcis", en: "Shortcuts" },
  main_menu: { ar: "القائمة الرئيسية", fr: "Menu principal", en: "Main menu" },
  quick_stats: { ar: "إحصائيات سريعة", fr: "Statistiques rapides", en: "Quick stats" },
  latest_invoices: { ar: "آخر فواتير المبيعات", fr: "Dernières factures", en: "Latest sales invoices" },
  top_customers: { ar: "أفضل العملاء", fr: "Meilleurs clients", en: "Top customers" },
  view_all: { ar: "عرض الكل", fr: "Voir tout", en: "View all" },
  status: { ar: "الحالة", fr: "État", en: "Status" },
  st_paid: { ar: "مدفوعة", fr: "Payée", en: "Paid" },
  st_partial: { ar: "جزئية", fr: "Partielle", en: "Partial" },
  st_unpaid: { ar: "غير مدفوعة", fr: "Impayée", en: "Unpaid" },
  st_returned: { ar: "مرتجعة", fr: "Retournée", en: "Returned" },
  st_done: { ar: "منجزة", fr: "Terminée", en: "Completed" },
  st_held: { ar: "معلّقة", fr: "En attente", en: "On hold" },
  returned: { ar: "المرتجعات", fr: "Retours", en: "Returned" },
  staff: { ar: "العمال", fr: "Personnel", en: "Staff" },
  suppliers: { ar: "الممونين", fr: "Fournisseurs", en: "Suppliers" },
  customers: { ar: "الزبائن", fr: "Clients", en: "Customers" },
  items: { ar: "المواد", fr: "Articles", en: "Items" },
  stocktake: { ar: "جرد المحل", fr: "Inventaire", en: "Stocktake" },
  stats: { ar: "إحصاء المحل", fr: "Statistiques", en: "Store stats" },
  capital: { ar: "رأس المال", fr: "Capital", en: "Capital" },
  buy: { ar: "الشراء", fr: "Achat", en: "Purchase" },
  sell: { ar: "البيع", fr: "Vente", en: "Sell" },
  customer_name: { ar: "اسم الزبون", fr: "Nom du client", en: "Customer name" },
  new_customer: { ar: "زبون جديد", fr: "Nouveau client", en: "New customer" },
  close_box: { ar: "غلق الصندوق", fr: "Clôturer la caisse", en: "Close cashbox" },
  confirm_sale: { ar: "تأكيد البيع", fr: "Valider la vente", en: "Confirm sale" },
  new_sale: { ar: "جديد", fr: "Nouveau", en: "New" },
  hold: { ar: "تعليق", fr: "Mettre en attente", en: "Hold" },
  delete: { ar: "حذف", fr: "Supprimer", en: "Delete" },
  receipt: { ar: "وصل", fr: "Ticket", en: "Receipt" },
  deposit: { ar: "عربون", fr: "Acompte", en: "Deposit" },
  search_ph: {
    ar: "ابحث أو امسح الباركود...",
    fr: "Rechercher ou scanner un code-barres...",
    en: "Search or scan barcode...",
  },
  in_stock: { ar: "المخزون", fr: "Stock", en: "Stock" },
  in_cart: { ar: "في السلة", fr: "Dans le panier", en: "In cart" },
  cart_empty: {
    ar: "السلة فارغة، اختر مادة للبدء",
    fr: "Panier vide — choisissez un article",
    en: "Cart is empty — pick an item",
  },
  qty: { ar: "الكمية", fr: "Qté", en: "Qty" },
  item_name: { ar: "اسم المادة", fr: "Désignation", en: "Item name" },
  item_ref: { ar: "المرجع", fr: "Référence", en: "Reference" },
  auto_ref: { ar: "توليد تلقائي", fr: "Génération auto", en: "Auto-generate" },
  item_photo: { ar: "صورة المادة (اختياري)", fr: "Photo de l'article (optionnel)", en: "Item photo (optional)" },
  upload_photo: { ar: "رفع صورة", fr: "Téléverser une photo", en: "Upload photo" },
  remove_photo: { ar: "حذف الصورة", fr: "Retirer la photo", en: "Remove photo" },
  buy_price: { ar: "سعر الشراء", fr: "Prix d'achat", en: "Buy price" },
  wholesale: { ar: "سعر الجملة", fr: "Prix de gros", en: "Wholesale" },
  sell_price: { ar: "سعر البيع", fr: "Prix de vente", en: "Sell price" },
  total: { ar: "المجموع", fr: "Total", en: "Total" },
  add_item: { ar: "إضافة مادة", fr: "Ajouter un article", en: "Add item" },
  save_invoice: { ar: "حفظ الفاتورة", fr: "Enregistrer la facture", en: "Save invoice" },
  new_invoice: { ar: "فاتورة جديدة", fr: "Nouvelle facture", en: "New invoice" },
  print_invoice: { ar: "طباعة الفاتورة", fr: "Imprimer la facture", en: "Print invoice" },
  invoice_total: { ar: "مجموع الفاتورة", fr: "Total facture", en: "Invoice total" },
  barcode: { ar: "الباركود", fr: "Code-barres", en: "Barcode" },
  date: { ar: "التاريخ", fr: "Date", en: "Date" },
  user: { ar: "المستخدم", fr: "Utilisateur", en: "User" },
  invoice_no: { ar: "رقم الفاتورة", fr: "N° facture", en: "Invoice #" },
  items_count: { ar: "عدد المواد", fr: "Articles", en: "Items" },
  amount: { ar: "الإجمالي", fr: "Montant", en: "Amount" },
  net: { ar: "الصافي", fr: "Net", en: "Net" },
  manager: { ar: "المدير", fr: "Gérant", en: "Manager" },
  sales_tab: { ar: "مبيعات", fr: "Ventes", en: "Sales" },
  debts_tab: { ar: "ديون الزبائن", fr: "Créances clients", en: "Customer debts" },
  expenses_tab: { ar: "مصاريف", fr: "Dépenses", en: "Expenses" },
  staff_mgmt: { ar: "إدارة العمال", fr: "Gestion du personnel", en: "Staff management" },
  new_employee: { ar: "موظف جديد", fr: "Nouvel employé", en: "New employee" },
  net_salary: { ar: "صافي الراتب", fr: "Salaire net", en: "Net salary" },
  total_costs: {
    ar: "إجمالي المصاريف والمشتريات",
    fr: "Total charges et achats",
    en: "Total costs & purchases",
  },
  pay_salary: { ar: "دفع الراتب", fr: "Payer le salaire", en: "Pay salary" },
  add_expense: { ar: "إضافة مصروف", fr: "Ajouter une dépense", en: "Add expense" },
  note: { ar: "الملاحظة", fr: "Note", en: "Note" },
  store_purchases: { ar: "مشتريات المحل", fr: "Achats du magasin", en: "Store purchases" },
  daily_expenses: { ar: "المصاريف اليومية", fr: "Dépenses du jour", en: "Daily expenses" },
  expense_details: { ar: "تفاصيل المصاريف", fr: "Détail des dépenses", en: "Expense details" },
  damage_details: { ar: "تفاصيل التالف", fr: "Détail de la casse", en: "Damage details" },
  reason: { ar: "السبب", fr: "Motif", en: "Reason" },
  currency: { ar: "د.ج", fr: "DA", en: "DZD" },
  all_items: { ar: "الكل", fr: "Tout", en: "All" },
  empty_invoice: { ar: "لا توجد مواد في الفاتورة", fr: "Aucun article dans la facture", en: "No items in this invoice" },
  empty_invoice_hint: {
    ar: "أضف المواد من النموذج الجانبي لبدء فاتورة شراء.",
    fr: "Ajoutez des articles depuis le formulaire pour démarrer un bon d'achat.",
    en: "Add items from the side form to start a purchase invoice.",
  },
  empty_products: { ar: "لا توجد مواد بعد", fr: "Aucun article", en: "No items yet" },
  empty_products_hint: {
    ar: "سجّل مشترياتك أولًا وستظهر المواد هنا للبيع.",
    fr: "Enregistrez vos achats — les articles apparaîtront ici.",
    en: "Record your purchases first and items will show up here for selling.",
  },
  empty_table: { ar: "لا توجد بيانات", fr: "Aucune donnée", en: "No data yet" },
  empty_table_hint: {
    ar: "ستظهر السجلات هنا بمجرد تسجيل أول عملية.",
    fr: "Les enregistrements apparaîtront dès la première opération.",
    en: "Records appear here as soon as you log your first operation.",
  },
  empty_staff: { ar: "لا يوجد عمال", fr: "Aucun employé", en: "No employees" },
  empty_staff_hint: {
    ar: "أضف موظفًا لمتابعة الرواتب والمصاريف.",
    fr: "Ajoutez un employé pour suivre les salaires.",
    en: "Add an employee to track salaries and expenses.",
  },
  empty_categories: { ar: "لا توجد أصناف", fr: "Aucune catégorie", en: "No categories" },
  empty_categories_hint: {
    ar: "أضف أصنافًا لتنظيم موادك وتسهيل البيع.",
    fr: "Ajoutez des catégories pour organiser vos articles.",
    en: "Add categories to organise your items.",
  },
  empty_chart: { ar: "لا توجد حركة لعرضها", fr: "Rien à afficher", en: "Nothing to chart yet" },

  /* ---------- operations ---------- */
  save: { ar: "حفظ", fr: "Enregistrer", en: "Save" },
  cancel: { ar: "إلغاء", fr: "Annuler", en: "Cancel" },
  edit: { ar: "تعديل", fr: "Modifier", en: "Edit" },
  add: { ar: "إضافة", fr: "Ajouter", en: "Add" },
  search: { ar: "بحث", fr: "Recherche", en: "Search" },
  print: { ar: "طباعة", fr: "Impression", en: "Print" },
  confirm: { ar: "تأكيد", fr: "Confirmer", en: "Confirm" },
  actions: { ar: "إجراءات", fr: "Actions", en: "Actions" },
  name: { ar: "الاسم", fr: "Nom", en: "Name" },
  phone: { ar: "الهاتف", fr: "Téléphone", en: "Phone" },
  category: { ar: "الصنف", fr: "Catégorie", en: "Category" },
  categories: { ar: "الأصناف", fr: "Catégories", en: "Categories" },
  add_category: { ar: "إضافة صنف", fr: "Ajouter une catégorie", en: "Add category" },
  color: { ar: "اللون", fr: "Couleur", en: "Colour" },
  unit: { ar: "الوحدة", fr: "Unité", en: "Unit" },
  min_stock: { ar: "حد التنبيه", fr: "Seuil d'alerte", en: "Min stock" },
  expiry: { ar: "تاريخ الصلاحية", fr: "Date de péremption", en: "Expiry date" },
  low_stock: { ar: "مخزون منخفض", fr: "Stock faible", en: "Low stock" },
  expiring: { ar: "قرب انتهاء الصلاحية", fr: "Bientôt périmé", en: "Expiring soon" },
  out_of_stock: { ar: "نفذ المخزون", fr: "Rupture de stock", en: "Out of stock" },
  discount: { ar: "تخفيض", fr: "Remise", en: "Discount" },
  payment: { ar: "طريقة الدفع", fr: "Mode de paiement", en: "Payment" },
  m_cash: { ar: "نقدًا", fr: "Espèces", en: "Cash" },
  m_credit: { ar: "كريدي (دين)", fr: "Crédit", en: "Credit" },
  m_card: { ar: "بطاقة", fr: "Carte", en: "Card" },
  m_ccp: { ar: "CCP / تحويل", fr: "CCP / virement", en: "CCP / transfer" },
  m_baridimob: { ar: "بريدي موب", fr: "BaridiMob", en: "BaridiMob" },
  paid_amount: { ar: "المدفوع", fr: "Payé", en: "Paid" },
  change: { ar: "الصرف", fr: "Rendu", en: "Change" },
  remaining: { ar: "الباقي", fr: "Reste", en: "Remaining" },
  held_sales: { ar: "الفواتير المعلقة", fr: "Tickets en attente", en: "Held tickets" },
  resume: { ar: "استرجاع", fr: "Reprendre", en: "Resume" },
  refund: { ar: "إرجاع", fr: "Retour", en: "Refund" },
  invoice: { ar: "فاتورة A4", fr: "Facture A4", en: "A4 invoice" },
  labels: { ar: "طباعة الملصقات", fr: "Imprimer les étiquettes", en: "Print labels" },
  z_report: { ar: "تقرير الغلق", fr: "Rapport Z", en: "Z report" },
  open_box: { ar: "فتح الصندوق", fr: "Ouvrir la caisse", en: "Open cashbox" },
  opening_float: { ar: "رصيد البداية", fr: "Fond de caisse", en: "Opening float" },
  counted_cash: { ar: "النقد المحصى", fr: "Espèces comptées", en: "Counted cash" },
  expected_cash: { ar: "المتوقع في الصندوق", fr: "Espèces attendues", en: "Expected cash" },
  difference: { ar: "الفارق", fr: "Écart", en: "Difference" },
  session_closed: { ar: "الصندوق مغلق", fr: "Caisse fermée", en: "Cashbox closed" },
  backup: { ar: "النسخ الاحتياطي", fr: "Sauvegarde", en: "Backup" },
  export_json: { ar: "تصدير نسخة", fr: "Exporter une sauvegarde", en: "Export backup" },
  import_json: { ar: "استيراد نسخة", fr: "Importer une sauvegarde", en: "Import backup" },
  export_csv: { ar: "تصدير CSV", fr: "Export CSV", en: "Export CSV" },
  export_excel: { ar: "تصدير Excel", fr: "Export Excel", en: "Export Excel" },
  full_report: { ar: "تقرير شامل", fr: "Rapport complet", en: "Full report" },
  reset_data: { ar: "تصفير البيانات", fr: "Réinitialiser", en: "Reset all data" },
  reset_confirm: {
    ar: "سيتم حذف كل البيانات، متأكد؟",
    fr: "Toutes les données seront supprimées. Continuer ?",
    en: "This deletes everything. Sure?",
  },
  store_info: { ar: "معلومات المحل", fr: "Informations du magasin", en: "Store info" },
  tax_info: { ar: "المعلومات الجبائية", fr: "Identifiants fiscaux", en: "Tax identifiers" },
  tva_enabled: { ar: "تفعيل الرسم TVA", fr: "Activer la TVA", en: "Enable VAT (TVA)" },
  tva_rate: { ar: "نسبة الرسم %", fr: "Taux de TVA %", en: "VAT rate %" },
  stamp_duty: { ar: "الطابع الجبائي 1% (نقدًا)", fr: "Timbre fiscal 1% (espèces)", en: "Stamp duty 1% (cash)" },
  receipt_footer: { ar: "عبارة أسفل الوصل", fr: "Pied de ticket", en: "Receipt footer" },
  print_width: { ar: "مقاس الطباعة", fr: "Format d'impression", en: "Paper size" },
  address: { ar: "العنوان", fr: "Adresse", en: "Address" },
  wilaya: { ar: "الولاية", fr: "Wilaya", en: "Wilaya" },
  owner: { ar: "صاحب المحل", fr: "Propriétaire", en: "Owner" },
  wholesale_customer: { ar: "زبون جملة", fr: "Client de gros", en: "Wholesale customer" },
  credit_limit: { ar: "سقف الكريدي", fr: "Plafond de crédit", en: "Credit limit" },
  debt: { ar: "الدين", fr: "Créance", en: "Debt" },
  pay_debt: { ar: "تسديد دين", fr: "Régler une créance", en: "Settle debt" },
  supplier_debt: { ar: "ديون الممونين", fr: "Dettes fournisseurs", en: "Supplier debts" },
  pay_supplier: { ar: "دفع للممون", fr: "Payer le fournisseur", en: "Pay supplier" },
  advance: { ar: "سلفة", fr: "Avance", en: "Advance" },
  bonus: { ar: "منحة", fr: "Prime", en: "Bonus" },
  salary: { ar: "الراتب", fr: "Salaire", en: "Salary" },
  payroll: { ar: "كشف الرواتب", fr: "Paie", en: "Payroll" },
  role: { ar: "الوظيفة", fr: "Poste", en: "Role" },
  hired: { ar: "تاريخ التوظيف", fr: "Date d'embauche", en: "Hired" },
  add_damage: { ar: "تسجيل تالف", fr: "Enregistrer une casse", en: "Log damage" },
  total_profit: { ar: "الربح الإجمالي", fr: "Marge brute", en: "Gross profit" },
  stock_value: { ar: "قيمة المخزون", fr: "Valeur du stock", en: "Stock value" },
  best_sellers: { ar: "الأكثر مبيعًا", fr: "Meilleures ventes", en: "Best sellers" },
  alerts: { ar: "التنبيهات", fr: "Alertes", en: "Alerts" },
  notifications: { ar: "الإشعارات", fr: "Notifications", en: "Notifications" },
  today: { ar: "اليوم", fr: "Aujourd'hui", en: "Today" },
  this_month: { ar: "هذا الشهر", fr: "Ce mois", en: "This month" },
  all_time: { ar: "كل الفترات", fr: "Tout l'historique", en: "All time" },
  no_results: { ar: "لا نتائج", fr: "Aucun résultat", en: "No results" },
  sold_qty: { ar: "الكمية المباعة", fr: "Quantité vendue", en: "Sold qty" },
  revenue: { ar: "رقم الأعمال", fr: "Chiffre d'affaires", en: "Revenue" },
  profit: { ar: "الربح", fr: "Bénéfice", en: "Profit" },
  delete_confirm: { ar: "حذف هذا السجل؟", fr: "Supprimer cet enregistrement ?", en: "Delete this record?" },
  scan_hint: {
    ar: "امسح الباركود مباشرة بالقارئ",
    fr: "Scannez un code-barres avec la douchette",
    en: "Scan a barcode with your reader",
  },
  refund_hint: {
    ar: "اختر الكميات المراد إرجاعها لكل منتج",
    fr: "Choisissez les quantités à rembourser pour chaque article",
    en: "Choose the quantities to refund for each product",
  },
  offline_note: {
    ar: "كل البيانات محفوظة في الجهاز وتعمل بدون أنترنت",
    fr: "Toutes les données sont stockées sur l'appareil, sans internet",
    en: "All data is stored on-device and works offline",
  },
  quick_sale: { ar: "بيع سريع", fr: "Vente rapide", en: "Quick sale" },
  price: { ar: "السعر", fr: "Prix", en: "Price" },
  purchases_history: { ar: "سجل المشتريات", fr: "Historique des achats", en: "Purchase history" },
  sales_history: { ar: "سجل المبيعات", fr: "Historique des ventes", en: "Sales history" },
  supplier: { ar: "الممون", fr: "Fournisseur", en: "Supplier" },
  none: { ar: "بدون", fr: "Aucun", en: "None" },
  stocktake_hint: {
    ar: "عدّل الكمية الحقيقية بعد الجرد وسيُحفظ الفرق تلقائيًا.",
    fr: "Saisissez la quantité comptée — l'écart est enregistré automatiquement.",
    en: "Type the counted quantity — the difference is saved automatically.",
  },
  install_hint: {
    ar: "يعمل على الحاسوب وأندرويد",
    fr: "Fonctionne sur PC et Android",
    en: "Runs on desktop and Android",
  },
  logo: { ar: "شعار المحل", fr: "Logo du magasin", en: "Store logo" },
  upload_logo: { ar: "رفع الشعار", fr: "Téléverser le logo", en: "Upload logo" },
  remove_logo: { ar: "حذف الشعار", fr: "Retirer le logo", en: "Remove logo" },
  logo_on_receipt: { ar: "الشعار على الوصل الحراري", fr: "Logo sur le ticket", en: "Logo on receipt" },
  logo_hint: {
    ar: "PNG أو JPG — يظهر أعلى الوصل والفاتورة A4.",
    fr: "PNG ou JPG — imprimé en haut du ticket et de la facture A4.",
    en: "PNG or JPG — printed at the top of receipts and A4 invoices.",
  },
  export_lang_hint: {
    ar: "ملفات Excel تُصدَّر بلغة التطبيق الحالية.",
    fr: "Les fichiers Excel sont exportés dans la langue actuelle de l'application.",
    en: "Excel files are exported in the app's current language.",
  },
  employee: { ar: "الموظف", fr: "Employé", en: "Employee" },
  select_supplier: { ar: "اختر الممون", fr: "Choisir un fournisseur", en: "Select supplier" },
  print_bon: { ar: "طباعة وصل الشراء", fr: "Imprimer le bon d'achat", en: "Print purchase note" },
  saved_ok: { ar: "تم الحفظ", fr: "Enregistré", en: "Saved" },
  amount_paid: { ar: "المبلغ المدفوع", fr: "Montant payé", en: "Amount paid" },
  no_session: { ar: "الصندوق مغلق — افتحه للبدء", fr: "Caisse fermée — ouvrez-la pour commencer", en: "Cashbox closed — open it to start" },
  session_since: { ar: "مفتوح منذ", fr: "Ouvert depuis", en: "Open since" },
  expense_category: { ar: "نوع المصروف", fr: "Type de dépense", en: "Expense type" },
  pay: { ar: "دفع", fr: "Payer", en: "Pay" },
  history: { ar: "السجل", fr: "Historique", en: "History" },
  total_paid: { ar: "مجموع المدفوع", fr: "Total payé", en: "Total paid" },
  kind: { ar: "النوع", fr: "Type", en: "Type" },
  purchase_lines: { ar: "أسطر الفاتورة", fr: "Lignes de la facture", en: "Invoice lines" },
  remove: { ar: "إزالة", fr: "Retirer", en: "Remove" },
  empty_expenses: { ar: "لا توجد مصاريف", fr: "Aucune dépense", en: "No expenses" },
  empty_expenses_hint: { ar: "سجّل مصاريف اليوم لتظهر هنا.", fr: "Enregistrez une dépense pour la voir ici.", en: "Log an expense to see it here." },
  loyalty: { ar: "نقاط الوفاء", fr: "Fidélité", en: "Loyalty" },
  loyalty_enabled: { ar: "تفعيل نقاط الوفاء", fr: "Activer la fidélité", en: "Enable loyalty points" },
  loyalty_earn_per: {
    ar: "المبلغ المطلوب لنقطة واحدة",
    fr: "Montant dépensé pour 1 point",
    en: "Spend needed for 1 point",
  },
  loyalty_point_value: { ar: "قيمة النقطة الواحدة", fr: "Valeur d'un point", en: "Value of 1 point" },
  loyalty_hint: {
    ar: "الزبون يربح نقاطًا في كل بيعة ويمكنه استعمالها كتخفيض.",
    fr: "Le client cumule des points à chaque vente et peut les utiliser en remise.",
    en: "Customers earn points on every sale and can spend them as a discount.",
  },
  points: { ar: "النقاط", fr: "Points", en: "Points" },
  points_available: { ar: "النقاط المتوفرة", fr: "Points disponibles", en: "Points available" },
  use_points: { ar: "استعمال النقاط", fr: "Utiliser des points", en: "Use points" },
  points_earned: { ar: "نقاط مكتسبة", fr: "Points gagnés", en: "Points earned" },
  haptics: { ar: "الاهتزاز عند اللمس", fr: "Retour haptique", en: "Haptic feedback" },
  haptics_on: { ar: "الاهتزاز مفعّل", fr: "Vibrations activées", en: "Haptics on" },
  haptics_off: { ar: "الاهتزاز متوقف", fr: "Vibrations désactivées", en: "Haptics off" },
  scan_camera: { ar: "مسح بالكاميرا", fr: "Scanner avec la caméra", en: "Scan with camera" },
  scan_btn: { ar: "مسح", fr: "Scanner", en: "Scan" },
  scan_stop: { ar: "إيقاف المسح", fr: "Arrêter", en: "Stop" },
  scan_waiting: {
    ar: "وجّه الكاميرا نحو الباركود…",
    fr: "Visez le code-barres avec l'appareil photo…",
    en: "Aim the camera at the barcode…",
  },
  scan_failed: {
    ar: "تعذّر المسح أو أُلغي",
    fr: "Scan impossible ou annulé",
    en: "Scan failed or cancelled",
  },
  camera_denied: {
    ar: "سمِح للكاميرا من إعدادات جهازك لاستخدام الماسح الضوئي",
    fr: "Autorisez l'accès à la caméra dans les paramètres pour utiliser le scanner",
    en: "Allow camera access in your device settings to use the scanner",
  },
  nav_desk: { ar: "الحضور", fr: "Présence", en: "Attendance" },
  desk_title: { ar: "من كان على الكاش اليوم", fr: "Qui était à la caisse", en: "Who was on the desk" },
  desk_pick: { ar: "اختر يومًا", fr: "Choisir un jour", en: "Pick a day" },
  desk_first: { ar: "أول عملية", fr: "Première vente", en: "First sale" },
  desk_last: { ar: "آخر عملية", fr: "Dernière vente", en: "Last sale" },
  desk_onshift: { ar: "على الكاش", fr: "À la caisse", en: "On desk" },
  desk_sales: { ar: "عدد المبيعات", fr: "Ventes", en: "Sales" },
  desk_no_activity: {
    ar: "لا مبيعات مسجلة في هذا اليوم",
    fr: "Aucune vente enregistrée ce jour",
    en: "No sales recorded on this day",
  },
  desk_employee_sales: { ar: "مبيعات الموظف", fr: "Ventes de l'employé", en: "Employee's sales" },
  desk_items_total: { ar: "إجمالي المواد", fr: "Articles au total", en: "Total items" },
  emp_view_only: {
    ar: "تشاهد مبيعاتك فقط — بدون تعديل أو حذف",
    fr: "Vous voyez uniquement vos ventes — aucune modification",
    en: "You can view your own sales only — no edit or delete",
  },
  notif_stock: { ar: "مخزون منخفض", fr: "Stock faible", en: "Low stock" },
  notif_expiring: { ar: "قرب انتهاء الصلاحية", fr: "Bientôt périmé", en: "Expiring soon" },
  notif_refunds_today: { ar: "إرجاعات اليوم", fr: "Retours du jour", en: "Refunds today" },
  notif_open_cash: {
    ar: "افتح الصندوق لبدء اليوم",
    fr: "Ouvrez la caisse pour démarrer",
    en: "Open the cashbox to start",
  },
} as const satisfies Record<string, Entry>;

export type TKey = keyof typeof dict;

const LANGS: Lang[] = ["ar", "fr", "en"];

type AppCtx = {
  lang: Lang;
  /** Text direction of *content*; the app layout itself always stays LTR. */
  dir: "ltr";
  setLang: (l: Lang) => void;
  toggleLang: () => void;
  t: (k: TKey) => string;
  theme: GeneratedTheme | null;
  shuffleTheme: () => void;
};

const Ctx = createContext<AppCtx | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>("ar");
  const [theme, setTheme] = useState<GeneratedTheme | null>(null);

  const shuffleTheme = useCallback(() => {
    const next = generateTheme();
    applyTheme(next);
    setTheme(next);
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("stock-manager-lang") as Lang | null;
    if (saved && LANGS.includes(saved)) setLang(saved);
    shuffleTheme();
  }, [shuffleTheme]);

  useEffect(() => {
    document.documentElement.lang = lang;
    // The interface stays left-to-right in every language (requested):
    // only the wording changes when Arabic is selected.
    document.documentElement.dir = "ltr";
    window.localStorage.setItem("stock-manager-lang", lang);
  }, [lang]);

  const value = useMemo<AppCtx>(
    () => ({
      lang,
      dir: "ltr",
      setLang,
      toggleLang: () => setLang((l) => LANGS[(LANGS.indexOf(l) + 1) % LANGS.length]),
      t: (k: TKey) => dict[k]?.[lang] ?? String(k),
      theme,
      shuffleTheme,
    }),
    [lang, theme, shuffleTheme],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

const LOCALES: Record<Lang, string> = { ar: "ar-DZ", fr: "fr-DZ", en: "en-US" };

export function useMoney() {
  const { lang } = useApp();
  return (n: number) =>
    `${n.toLocaleString(lang === "ar" ? "fr-DZ" : LOCALES[lang], {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${lang === "ar" ? "د.ج" : "DA"}`;
}

export function useLocale() {
  const { lang } = useApp();
  return LOCALES[lang];
}
