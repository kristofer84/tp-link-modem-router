/**
 * @swagger
 * tags:
 *   name: LTE
 *   description: LTE modem status
 */

/**
 * @swagger
 *  components:
 *    schemas:
 *      LteStatus:
 *        type: object
 *        properties:
 *          networkType:      { type: string,  description: Decoded radio access technology }
 *          networkTypeCode:  { type: integer, description: Raw netType index }
 *          signalBars:       { type: integer, description: Signal level as shown in the web UI (0-4) }
 *          signalPercent:    { type: integer, description: signalBars expressed as a percentage }
 *          rsrp:             { type: integer, description: Reference Signal Received Power, dBm }
 *          rsrq:             { type: integer, description: Reference Signal Received Quality, dB }
 *          rssi:             { type: integer, description: Received Signal Strength Indicator, dBm }
 *          sinr:             { type: number,  description: Signal to Interference plus Noise Ratio, dB }
 *          sinrRaw:          { type: integer, description: Raw modem SINR value, tenths of a dB }
 *          earfcn:           { type: integer, description: Downlink EARFCN of the serving cell }
 *          band:             { type: string,  description: Primary component carrier band }
 *          bandSecondary:    { type: string,  description: Secondary component carrier band when aggregating, else null }
 *          bands:            { type: array,   items: { type: string }, description: All component carrier bands in use }
 *          bandsLabel:       { type: string,  description: Human label for the aggregate, e.g. "3 + 7" }
 *          carrierAggregation: { type: boolean, description: True when a secondary component carrier is in use }
 *          operator:         { type: string,  description: Network operator name }
 *          registered:       { type: boolean, description: Whether the modem is registered on a network }
 *          roaming:          { type: boolean, description: Whether the modem is roaming }
 *          wanLinkStatus:    { type: string,  description: physicalLinkStatus of the LTE WAN interface }
 *          unreadSms:        { type: integer, description: Number of unread SMS held by the modem }
 *          publicIp:         { type: string,  description: Public IPv4 the carrier has assigned to the LTE WAN }
 *          simStatus:        { type: string,  description: Decoded SIM state }
 *          simStatusCode:    { type: integer, description: Raw simStatus index }
 *          simReady:         { type: boolean, description: True when the SIM is usable (prepared or unlocked) }
 *          dataUsedTotal:    { type: integer, description: Lifetime bytes over the LTE link }
 *          dataUsedToday:    { type: integer, description: Bytes used so far today }
 *          dataUsedPeriod:   { type: integer, description: Bytes used in the current billing period; 0 unless a payment day is configured }
 *          rxSpeed:          { type: integer, description: Current downstream throughput, bytes/second }
 *          txSpeed:          { type: integer, description: Current upstream throughput, bytes/second }
 *          dataLimitEnabled: { type: boolean, description: Whether a data cap is configured on the modem }
 *          dataLimit:        { type: integer, description: Configured cap in bytes, 0 when unset }
 *          billingDay:       { type: integer, description: Day of month the usage counter rolls over }
 *          billingNextDue:   { type: string,  description: ISO timestamp of the next rollover, null when not configured }
 *          raw:              { type: object,  description: Undecoded modem status fields }
 */

/**
 * @swagger
 * /lte/status:
 *   get:
 *     summary: Signal quality and registration state of the LTE modem
 *     description:
 *       Returns the modem's radio metrics (RSRP/RSRQ/RSSI/SINR), the serving
 *       cell's EARFCN and derived band, the radio access technology, the
 *       operator and the LTE WAN link state. Intended for dashboards and
 *       alerting - it is the only visibility into the 4G side of the link.
 *     tags: [LTE]
 *     security:
 *       - basicAuth: []
 *     responses:
 *       "200":
 *         description: Current modem status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: integer }
 *                 data:   { $ref: '#/components/schemas/LteStatus' }
 *       "502":
 *         description: The router could not be queried
 */

import express from 'express';
import { TP_ACT } from '../routerProtocol.mjs'

const router = express.Router();

// Index maps directly onto the stock web UI's networkType_str table.
const NETWORK_TYPE = [
  'No Service', 'GSM', 'WCDMA', '4G LTE', 'TD-SCDMA', 'CDMA 1x', 'CDMA 1x Ev-Do', '4G+ LTE',
];

// Band index -> label, verbatim from the stock web UI (status.htm, `bandInfoList`).
// The index encodes the radio technology too: 40-48 are GSM/UMTS frequency
// labels, 80-91 WCDMA band numbers, 120-160 LTE band numbers, 200-205 letters.
const BAND_INFO = {
  40:'450MHz',41:'480MHz',42:'750MHz',43:'850MHz',44:'900MHz',45:'900MHz',46:'900MHz',
  47:'1800MHz',48:'1900MHz',
  80:'1',81:'2',82:'3',83:'4',84:'5',85:'6',86:'7',87:'8',88:'9',90:'11',91:'12',
  120:'1',121:'2',122:'3',123:'4',124:'5',125:'6',126:'7',127:'8',128:'9',129:'10',
  130:'11',131:'12',132:'13',133:'14',134:'17',135:'33',136:'34',137:'35',138:'36',
  139:'37',140:'38',141:'39',142:'40',143:'18',144:'19',145:'20',146:'21',147:'24',
  148:'25',149:'41',150:'42',151:'43',152:'23',153:'26',154:'32',155:'125',156:'126',
  157:'127',158:'28',159:'29',160:'30',
  200:'A',201:'B',202:'C',203:'D',204:'E',205:'F',
};

// rfInfoBand packs two band indexes into one integer: the low byte is the
// primary component carrier, the high byte the secondary one (0 when not
// aggregating). The stock UI does exactly this and renders "3,7"; without the
// unpacking the raw value looks like meaningless noise (e.g. 32378 = 0x7E7A =
// bands 3 and 7).
function decodeBands(rfInfoBand) {
  const empty = { primary: null, secondary: null, list: [], label: null };
  if (rfInfoBand === null || rfInfoBand === -1) return empty;
  const lo = rfInfoBand & 0xff;
  const hi = (rfInfoBand >> 8) & 0xff;
  if (!lo) return empty;
  const primary = BAND_INFO[lo] ?? null;
  const secondary = hi ? (BAND_INFO[hi] ?? null) : null;
  const list = [primary, secondary].filter(band => band !== null);
  return { primary, secondary, list, label: list.length ? list.join(' + ') : null };
}

// SIM state, verbatim from the stock UI's `simStatusArray_str` (locale/en_US/array.js).
const SIM_STATUS = [
  'No SIM card detected or SIM card error',  // 0
  'No SIM card detected',                    // 1
  'SIM card error',                          // 2
  'SIM card prepared',                       // 3
  'SIM locked',                              // 4
  'SIM unlocked, authentication succeeded',  // 5
  'PIN locked',                              // 6
  'SIM card is locked permanently',          // 7
];

// E-UTRA band by downlink EARFCN, 3GPP TS 36.101 table 5.7.3-1. Only used as a
// fallback when rfInfoBand is unset, and as a cross-check on the primary.
const EARFCN_BANDS = [
  [0, 599, '1'], [1200, 1949, '3'], [2750, 3449, '7'], [3450, 3799, '8'],
  [6150, 6449, '20'], [9210, 9659, '28'], [9770, 9869, '32'],
  [37750, 38249, '38'], [38650, 39649, '40'], [39650, 41589, '41'],
];

function bandFromEarfcn(earfcn) {
  if (!Number.isFinite(earfcn)) return null;
  const hit = EARFCN_BANDS.find(([lo, hi]) => earfcn >= lo && earfcn <= hi);
  return hit ? hit[2] : null;
}

// The router returns every attribute as a string; missing ones must stay null
// rather than becoming 0, or a dashboard will show a confident wrong number.
function num(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

router.get('/status', async function (req, res) {
  const client = req.app.get('router_client');

  try {
    // Sequential on purpose: RouterClient holds one session and one token, so
    // concurrent execute() calls race each other and fail inside the response
    // parser rather than anywhere obvious.
    const netStatus = await client.execute({ method: TP_ACT.ACT_GL, controller: 'LTE_NET_STATUS' });
    const profStat = await client.execute({ method: TP_ACT.ACT_GL, controller: 'LTE_PROF_STAT' });
    const wanIntf = await client.execute({ method: TP_ACT.ACT_GL, controller: 'WAN_COMMON_INTF_CFG' });
    // WAN_LTE_LINK_CFG also carries the SIM's IMSI and the SMS service centre
    // number; only the two non-identifying fields below are read out of it.
    const lteLink = await client.execute({ method: TP_ACT.ACT_GL, controller: 'WAN_LTE_LINK_CFG' });
    const lteIntf = await client.execute({ method: TP_ACT.ACT_GL, controller: 'WAN_LTE_INTF_CFG' });

    const net = (netStatus.data || [])[0] || {};
    const prof = (profStat.data || [])[0] || {};
    const lteWan = (wanIntf.data || []).find(entry => entry.WANAccessType === 'LTE') || {};
    const link = (lteLink.data || [])[0] || {};
    const simCode = num(link.simStatus);

    // WAN_LTE_INTF_CFG returns two entries and only one carries the counters;
    // on this hardware the first is all zeros. Pick by largest lifetime total
    // rather than by index, so it keeps working if the order changes.
    const intf = (lteIntf.data || []).reduce(
      (best, entry) => (num(entry.totalStatistics) ?? 0) > (num(best?.totalStatistics) ?? -1) ? entry : best,
      null) || {};
    // Counters arrive as decimal strings ("1744470418868.0020"); bytes are whole.
    const bytes = value => { const n = num(value); return n === null ? null : Math.round(n); };
    const nextDue = num(intf.nextDue);

    const netTypeCode = num(net.netType);
    const bars = num(net.sigLevel);
    const earfcn = num(net.rfInfoChannel);
    const sinrRaw = num(net.rfInfoSnr);
    const bands = decodeBands(num(net.rfInfoBand));

    res.json({
      status: 200,
      data: {
        networkType: netTypeCode !== null ? (NETWORK_TYPE[netTypeCode] ?? 'Unknown') : null,
        networkTypeCode: netTypeCode,
        signalBars: bars,
        // The web UI renders signal strength as 25% per bar.
        signalPercent: bars !== null ? bars * 25 : null,
        rsrp: num(net.rfInfoRsrp),
        rsrq: num(net.rfInfoRsrq),
        rssi: num(net.rfInfoRssi),
        // The modem reports SINR in tenths of a dB.
        sinr: sinrRaw !== null ? sinrRaw / 10 : null,
        sinrRaw,
        earfcn,
        band: bands.primary ?? bandFromEarfcn(earfcn),
        bandSecondary: bands.secondary,
        bands: bands.list,
        bandsLabel: bands.label,
        // Strictly the packed high byte. netType stays 7 ("4G+ LTE") whenever the
        // cell is LTE-A capable, even while only one carrier is actually up, so
        // falling back to it would pin this true permanently and say nothing.
        // Observed flipping in practice: rfInfoBand 32378 (bands 3+7) -> 126
        // (band 7 alone) with netType 7 throughout.
        carrierAggregation: bands.secondary !== null,
        operator: prof.ispName || prof.spn || null,
        registered: num(net.regStat) === 1,
        roaming: num(net.roamStat) === 1,
        wanLinkStatus: lteWan.physicalLinkStatus ?? null,
        unreadSms: num(net.smsUnreadCount),
        // The carrier-assigned address. It changes on every LTE
        // re-registration, which is what the Loopia DynDNS updater chases.
        publicIp: link.ipv4 || null,
        simStatus: simCode !== null ? (SIM_STATUS[simCode] ?? 'Unknown') : null,
        simStatusCode: simCode,
        // 3 = prepared, 5 = unlocked after authentication; both are usable.
        simReady: simCode === 3 || simCode === 5,
        dataUsedTotal: bytes(intf.totalStatistics),
        dataUsedToday: bytes(intf.dailyFlow),
        // Only counts when enablePaymentDay is set; otherwise the modem leaves
        // it at 0 and dataUsedTotal is the only cumulative figure.
        dataUsedPeriod: bytes(intf.curStatistics),
        rxSpeed: bytes(intf.curRxSpeed),
        txSpeed: bytes(intf.curTxSpeed),
        dataLimitEnabled: num(intf.enableDataLimit) === 1,
        dataLimit: bytes(intf.dataLimit),
        billingDay: num(intf.paymentDay),
        billingNextDue: nextDue ? new Date(nextDue * 1000).toISOString() : null,
        // connStat/srvStat/rfInfoRat have no published mapping, so they are
        // passed through rather than guessed at. While the link is healthy
        // they read connStat=4, srvStat=2, rfInfoRat=3.
        raw: {
          connStat: num(net.connStat),
          regStat: num(net.regStat),
          srvStat: num(net.srvStat),
          roamStat: num(net.roamStat),
          rfInfoRat: num(net.rfInfoRat),
          rfInfoBand: num(net.rfInfoBand),
          rfInfoEcio: num(net.rfInfoEcio),
        },
      },
    });
  } catch (exception) {
    res.status(502).json({
      status: 502,
      exception: { name: exception.name, message: exception.message },
    });
  }
});

export default router;
