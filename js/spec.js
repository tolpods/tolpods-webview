// TOLPOD - dimensions straight from the Tol_Pods-Product_Design sheet (inches).
// Plan frame used everywhere: x = 0..90 (left -> right), y = 0..144 (back -> ENTRANCE end), z = up.
export const SPEC = {
  pod: { W: 90, L: 144, H: 92, roof: 2, deck: 4, wheel: 6 },
  walls: { left: 3.5, right: 6.5 },
  cabin: { x0: 3.5, x1: 83.5, y0: 48, y1: 144 },          // 80 × 96 interior
  entrance: { x0: 23.5, x1: 53.5, h: 80 },               // 30″ pathway
  chair: {
    width: 46, seatTop: 23, side: 4.5, centreX: 39.5, headY: 61, flatHeadY: 50.5,
    headrest: { long: 9, wide: 34, thick: 18 },
    back: { long: 30, thick: 18 },
    seat: { long: 25, thick: 23 },
    leg: { long: 18, thick: 12, hang: 49 },
    ext: { long: 12, wide: 33, thick: 6 },
    arm: { long: 15, wide: 4.5, deep: 3.5 },
    midArm: { long: 12, fromLeft: 12 },
    flat: { len: 75, withExt: 85 },
  },
  desk: { long: 21.5, wide: 10.75, joined: 43, slot: 2.5 },
  tv: { w: 43.6, h: 24.5, gapToRoof: 14, rail: 3 },
  coat: { w: 8, l: 28, h: 60 },
  block5: { l: 28, w: 18, h: 92, clearance: 3, fridge: { w: 19.1, d: 17.5, h: 31.2 }, surprise: 12.8, micro: { w: 17.3, d: 13, h: 10.2 }, cabinet: 34.8 },
  pillows: { d: 12, l: 42, h: 45, packets: 15, packet: 9, pillow: { thick: 6, w: 12, l: 14 }, blanket: 3 },
  minibar: { d: 12, l: 26, bottom: 16, top: 20, items: 36 },
  trash: { w: 20, l: 32, h: 36, cans: 4, canDia: 10, canH: 30, clearance: 6, bucket: [20, 20, 36] },
  free: { w: 12, l: 28, h: 35 },
  premium: { w: 12, l: 44, h: 92 },
  m14: { w: 39, d: 48, h: 92 }, m11: { w: 26, d: 40, h: 92 }, m13: { w: 26, d: 8, h: 92 }, m12: { w: 15, d: 48, h: 92, rows: 5 },
};

export const FEATURES = [
  ['Massage chair', 'Broad chair with three armrests and nine cupholders. Seat height adjusts 17-23″. Reclines to a flat 75″ bed, 85″ with the leg extension.'],
  ['Pull-out desks', 'Two powered desks rise out of the armrests, rotate and join with magnets into one 43″ desk.'],
  ['50″ TV on a ceiling rail', 'Rolls along a sturdy ceiling rail and flips up out of the way so you can walk in.'],
  ['Premium & free storage', 'A full-height locker for a large suitcase, and a carry-on locker. Both lock from the app.'],
  ['Pillows & blankets', 'Fifteen packets in three divisions, dispensed one at a time from the app.'],
  ['Smart minibar', 'Weight-sensor shelf with 30-40 items and a cleaning-supply cabinet below.'],
  ['Fridge, microwave, surprise box', 'Mini fridge, microwave and a gift compartment for charity donations.'],
  ['Smart trash', 'Four rotating cans with compactors, a no-touch opening and a foot-lever backup.'],
  ['Two layers of smart glass', 'Optional PDLC glass: one layer to chair level, one to the top.'],
  ['Privacy cameras', 'One facing out, one facing in, each with a shutter you control from the app.'],
  ['Public side', 'Cold-drink and snack vending, refrigerated storage, a touch screen and an ad screen.'],
  ['On wheels', 'Wheels under every component; solid locks replace them when parked.'],
];
