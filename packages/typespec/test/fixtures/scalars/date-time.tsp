import "@typespec/http";

using Http;
using Nxgt;

namespace ScalarsFixture;

model DateTimeScalars {
  date: date;
  dateTime: dateTime;
  isoDuration: isoDuration;
  localDateTime: localDateTime;
  localTime: localTime;
  time: time;
  timeZone: timeZone;
  timestamp: timestamp;
  utcOffset: utcOffset;
}

@route("/date-time") @post op postDateTimeScalars(@body body: DateTimeScalars): DateTimeScalars;
