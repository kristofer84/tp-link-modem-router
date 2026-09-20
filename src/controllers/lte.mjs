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
 *          earfcn:           { type: integer, description: Downlink EARFCN of the SERVING cell only }
 *          band:             { type: string,  description: Band of the SERVING cell, derived from the EARFCN; null when unknown }
 *          carrierAggregation: { type: boolean, description: True when the modem reports 4G+, i.e. at least one secondary carrier the firmware does not name }
 *          operator:         { type: string,  description: Network operator name }
 *          registered:       { type: boolean, description: Whether the modem is registered on a network }
 *          roaming:          { type: boolean, description: Whether the modem is roaming }
 *          wanLinkStatus:    { type: string,  description: physicalLinkStatus of the LTE WAN interface }
 *          unreadSms:        { type: integer, description: Number of unread SMS held by the modem }
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

// E-UTRA band by downlink EARFCN, 3GPP TS 36.101 table 5.7.3-1.
// Only the bands plausible for this hardware are listed; anything else returns null.
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

    const net = (netStatus.data || [])[0] || {};
    const prof = (profStat.data || [])[0] || {};
    const lteWan = (wanIntf.data || []).find(entry => entry.WANAccessType === 'LTE') || {};

    const netTypeCode = num(net.netType);
    const bars = num(net.sigLevel);
    const earfcn = num(net.rfInfoChannel);
    const sinrRaw = num(net.rfInfoSnr);

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
        band: bandFromEarfcn(earfcn),
        // 4G+ means at least one secondary component carrier is in use. The
        // router never says which: LTE_BANDINFO returns the same single
        // LTE_ActiveBand/LTE_ActiveChannel pair as LTE_NET_STATUS, so `band`
        // and `earfcn` above describe the serving carrier only.
        carrierAggregation: netTypeCode === 7,
        operator: prof.ispName || prof.spn || null,
        registered: num(net.regStat) === 1,
        roaming: num(net.roamStat) === 1,
        wanLinkStatus: lteWan.physicalLinkStatus ?? null,
        unreadSms: num(net.smsUnreadCount),
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
