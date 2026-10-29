/**
 * IPMsg (IP Messenger) Protocol Parser & Serializer
 * Standard format: "version:packetNo:senderNick:senderHost:command:extra"
 * UDP Port: 2425, TCP Port: 2425
 */
import { IPMsgPacket } from '../types';

export const IPMSG_VERSION = 1;

// IPMsg standard commands
export const IPMSG_NOOPERATION = 0x00000000;
export const IPMSG_BR_ENTRY = 0x00000001;
export const IPMSG_BR_EXIT = 0x00000002;
export const IPMSG_ANSENTRY = 0x00000003;
export const IPMSG_BR_ABSENCE = 0x00000004;
export const IPMSG_SENDMSG = 0x00000020;
export const IPMSG_RECVMSG = 0x00000021;
export const IPMSG_READMSG = 0x00000030;
export const IPMSG_DELMSG = 0x00000040;

// Options & flags
export const IPMSG_SENDCHECKOPT = 0x00000100;
export const IPMSG_SECRETOPT = 0x00000200;
export const IPMSG_BROADCASTOPT = 0x00000400;
export const IPMSG_MULTICASTOPT = 0x00000800;
export const IPMSG_NOPOPUPOPT = 0x00001000;
export const IPMSG_FILEATTACHOPT = 0x00200000;

// Custom FeiLink extensions
export const IPMSG_FEILINK_TYPING = 0x00001001;
export const IPMSG_FEILINK_GROUPMSG = 0x00001002;

/**
 * Serialize IPMsgPacket into a standard wire protocol string.
 */
export function serializeIPMsgPacket(packet: IPMsgPacket): string {
  const { version, packetNo, senderNick, senderHost, command, extra } = packet;
  return `${version}:${packetNo}:${senderNick}:${senderHost}:${command}:${extra}`;
}

/**
 * Parse an incoming raw IPMsg string into IPMsgPacket structure.
 * Returns null if the payload is malformed.
 */
export function parseIPMsgPacket(raw: string): IPMsgPacket | null {
  if (!raw || typeof raw !== 'string') return null;
  
  // Format is version:packetNo:senderNick:senderHost:command:extra
  // extra may contain colons, so split only the first 5 parts
  const parts = raw.split(':');
  if (parts.length < 5) return null;

  const version = parseInt(parts[0], 10);
  const packetNo = parseInt(parts[1], 10);
  const senderNick = parts[2];
  const senderHost = parts[3];
  const command = parseInt(parts[4], 10);
  const extra = parts.slice(5).join(':');

  if (Number.isNaN(version) || Number.isNaN(packetNo) || Number.isNaN(command)) {
    return null;
  }

  return {
    version,
    packetNo,
    senderNick,
    senderHost,
    command,
    extra,
  };
}

/**
 * Generate a sequential or timestamp-based packet number.
 */
let packetSequence = Math.floor(Date.now() / 1000);
export function getNextPacketNo(): number {
  packetSequence += 1;
  return packetSequence;
}

/**
 * Create a standard entry broadcast packet
 */
export function createOnlineBroadcastPacket(nickname: string, hostname: string, dept: string): IPMsgPacket {
  return {
    version: IPMSG_VERSION,
    packetNo: getNextPacketNo(),
    senderNick: nickname,
    senderHost: hostname,
    command: IPMSG_BR_ENTRY,
    extra: dept,
  };
}

/**
 * Create a message packet
 */
export function createMessagePacket(
  nickname: string,
  hostname: string,
  message: string,
  isBroadcast = false
): IPMsgPacket {
  let command = IPMSG_SENDMSG | IPMSG_SENDCHECKOPT;
  if (isBroadcast) {
    command |= IPMSG_BROADCASTOPT;
  }
  return {
    version: IPMSG_VERSION,
    packetNo: getNextPacketNo(),
    senderNick: nickname,
    senderHost: hostname,
    command,
    extra: message,
  };
}
