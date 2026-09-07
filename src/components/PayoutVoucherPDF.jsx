import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    padding: 40,
    color: '#333',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  companyName: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  companyMeta: {
    fontSize: 8,
    color: '#555',
    lineHeight: 1.5,
  },
  logoPlaceholder: {
    width: 120,
    height: 60,
    borderRadius: 4,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#1565c0',
  },
  logoSub: {
    fontSize: 7,
    color: '#1565c0',
  },
  title: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: '#1565c0',
    marginBottom: 4,
  },
  statusBadge: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#fff',
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    alignSelf: 'flex-start',
    marginBottom: 16,
    textTransform: 'uppercase',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  block: { width: '48%' },
  metaItem: { marginBottom: 8 },
  label: {
    fontSize: 7,
    color: '#999',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  sub: {
    fontSize: 8,
    color: '#555',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  gridItem: { width: '50%', marginBottom: 12 },
  descBlock: {
    backgroundColor: '#fafafa',
    borderRadius: 4,
    padding: 10,
    marginBottom: 24,
  },
  descText: {
    fontSize: 8,
    color: '#555',
    lineHeight: 1.4,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1.5,
    borderTopColor: '#333',
  },
  amountLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  amountValue: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#1565c0',
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 7,
    color: '#bbb',
    borderTopWidth: 0.5,
    borderTopColor: '#eee',
    paddingTop: 6,
  },
});

const STATUS_COLOR = {
  completed:   '#22c55e',
  processing:  '#3b82f6',
  pending_pin: '#f59e0b',
  failed:      '#ef4444',
  expired:     '#6b7280',
  cancelled:   '#6b7280',
};

const STATUS_LABEL = {
  completed:   'Completed',
  processing:  'Processing',
  pending_pin: 'Awaiting PIN',
  failed:      'Failed',
  expired:     'PIN Expired',
  cancelled:   'Cancelled',
};

const TYPE_LABEL = {
  payroll:      'Payroll',
  single:       'Single Payment',
  b2b:          'B2B Payment',
  txn_payout:   'Transaction Payout',
  batch_payout: 'Batch Payout',
};

const fmt = (n) =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(n || 0);

const fmtDate = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const PayoutVoucherPDF = ({ voucher }) => {
  if (!voucher) return null;

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>GIBRO Enterprise LTD</Text>
            <Text style={styles.companyMeta}>Likoni Road{'\n'}NAIROBI, NAIROBI 00100 KE{'\n'}+254710341246{'\n'}info@gibroenterprise.co.ke{'\n'}PIN P051595908Z</Text>
          </View>
          <View style={styles.logoPlaceholder}>
            <Text style={styles.logoText}>GIBRO</Text>
            <Text style={styles.logoSub}>ENTERPRISE LTD</Text>
          </View>
        </View>

        {/* Title + status */}
        <Text style={styles.title}>Payment Voucher</Text>
        <Text style={[styles.statusBadge, { backgroundColor: STATUS_COLOR[voucher.status] || '#6b7280' }]}>
          {STATUS_LABEL[voucher.status] || voucher.status}
        </Text>

        {/* Paid To + Voucher meta */}
        <View style={styles.metaRow}>
          <View style={styles.block}>
            <Text style={styles.label}>Paid To</Text>
            <Text style={styles.value}>{voucher.recipientName || '—'}</Text>
            {voucher.recipientPhone ? <Text style={styles.sub}>{voucher.recipientPhone}</Text> : null}
            {voucher.destinationAccount ? <Text style={styles.sub}>Account: {voucher.destinationAccount}</Text> : null}
            {voucher.accountReference ? <Text style={styles.sub}>Reference: {voucher.accountReference}</Text> : null}
          </View>
          <View style={styles.block}>
            <View style={styles.metaItem}>
              <Text style={styles.label}>Voucher No.</Text>
              <Text style={styles.value}>{voucher.voucherNumber}</Text>
            </View>
            <View>
              <Text style={styles.label}>Date</Text>
              <Text style={styles.value}>{fmtDate(voucher.date)}</Text>
            </View>
          </View>
        </View>

        {/* Details grid */}
        <View style={styles.grid}>
          <View style={styles.gridItem}>
            <Text style={styles.label}>Payment Type</Text>
            <Text style={styles.value}>{TYPE_LABEL[voucher.type] || voucher.type}</Text>
          </View>
          <View style={styles.gridItem}>
            <Text style={styles.label}>Initiated By</Text>
            <Text style={styles.value}>{voucher.initiatedBy || '—'}</Text>
          </View>
          <View style={styles.gridItem}>
            <Text style={styles.label}>M-Pesa Transaction Code</Text>
            <Text style={styles.value}>{voucher.mpesaCode || '—'}</Text>
          </View>
          {voucher.staffNo ? (
            <View style={styles.gridItem}>
              <Text style={styles.label}>Staff No.</Text>
              <Text style={styles.value}>{voucher.staffNo}</Text>
            </View>
          ) : null}
        </View>

        {/* Description */}
        <View style={styles.descBlock}>
          <Text style={styles.label}>Description</Text>
          <Text style={styles.descText}>{voucher.description || '—'}</Text>
        </View>

        {/* Amount */}
        <View style={styles.amountRow}>
          <Text style={styles.amountLabel}>Amount Paid</Text>
          <Text style={styles.amountValue}>{fmt(voucher.amount)}</Text>
        </View>

        <Text style={styles.footer}>Generated {fmtDate(new Date())} by GibroCash</Text>
      </Page>
    </Document>
  );
};

export default PayoutVoucherPDF;
