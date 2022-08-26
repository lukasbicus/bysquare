import * as lzma from "lzma-native"

import { Model, ModelOrdered } from "./index"

// echo "Hello" | xz --format=raw --lzma1=lc=3,lp=0,pb=2,dict=32KiB --stdout | hexdump -C

/**
 * ```
 * | Attribute    | Number of bits | Possible values | Note
 * --------------------------------------------------------------------------------------------
 * | BySquareType | 4              | 0-15            | by square type
 * | Version      | 4              | 0-15            | version of the by square type
 * | DocumentType | 4              | 0-15            | document type within given by square type
 * | Reserved     | 4              | 0-15            | bits reserved for future needs
 * ```
 *
 * @see {spec 3.5.}
 */
export function createBysquareHeader(
	// prettier-ignore
	header: [
		bySquareType: number, version: number,
		documentType: number, reserved: number
	] = [
			0b0000_0000, 0b0000_0000,
			0b0000_0000, 0b0000_0000
		]
): Buffer {
	const isValid = header.every((nibble) => 0 <= nibble && nibble <= 15)
	if (!isValid) {
		throw new Error("Header range of values must be <0,15>")
	}

	const [BySquareType, Version, DocumentType, Reserved] = header
	/** Combine 4-nibbles to 2-bytes */
	const headerBuffer = Buffer.from([
		(BySquareType << 4) | (Version << 0),
		(DocumentType << 4) | (Reserved << 0)
	])

	return headerBuffer
}

/**
 * LZMA Compression header
 *
 * @see {spec 3.11.}
 */
function createCompresionHeader(byteLength: number): Buffer {
	const dataSize = Buffer.alloc(2)
	dataSize.writeInt16LE(byteLength, 0)
	return dataSize
}

export function createChecksum(tabbedInput: string): Buffer {
	// @ts-ignore: Wrong return type
	const data = lzma.crc32(tabbedInput) as number
	const crc32 = Buffer.alloc(4)
	crc32.writeUInt32LE(data)

	return crc32
}

/**
 * Appending CRC32 checksum
 *
 * @see {spec 3.10.}
 */
export function dataWithChecksum(model: Model): Buffer {
	const tabbedString = createTabbedString(model)
	const checksum = createChecksum(tabbedString)
	const merged = Buffer.concat([
		checksum,
		Buffer.from(tabbedString, "utf-8")
	])

	return merged
}

/**
 * Order keys by specification
 * Fill empty values
 * Transform to tabbed string
 */
export function createTabbedString(model: Model): string {
	const tabbedModel: string = (Object.keys(model) as (keyof Model)[])
		.reduce<string[]>((acc, key) => {
			acc[ModelOrdered[key]] = String(model[key] ?? "")
			return acc
		}, Array<string>(33).fill(""))
		.join("\t")

	return tabbedModel
}


/**
 * The bit sequence is split into 5 bit chunks which are mapped onto the
 * characters
 *
 * @see {spec 3.13. Table 9 – Encoding table}
 */
 export const SUBST = "0123456789ABCDEFGHIJKLMNOPQRSTUV"

/**
 * Alphanumeric conversion using Base32hex
 *
 * @see {spec 3.13.}
 */
export function alphanumericConversion(data: Buffer): string {
	let paddedBinString = data.reduce<string>(
		(acc, byte) => acc + byte.toString(2).padStart(8, "0"),
		""
	)
	let paddedLength = paddedBinString.length
	const remainder = paddedLength % 5
	if (remainder) {
		paddedBinString += Array(5 - remainder)
			.fill("0")
			.join("")

		paddedLength += 5 - remainder
	}

	/**
	 * Map a binary number of 5 bits to a string representation 2^5
	 * SUBST[0...32] represents char
	 *
	 * @see {@link SUBST}
	 */
	let encoded = ""
	for (let i = 0; i < paddedLength / 5; i++) {
		const binStart = 5 * i
		const binEnd = 5 * i + 5
		const sliced = paddedBinString.slice(binStart, binEnd)
		const key = parseInt(sliced, 2)
		encoded += SUBST[key]
	}

	return encoded
}

export function generate(model: Model): Promise<string> {
	const dataBuffer: Buffer = dataWithChecksum(model)
	const dataChunks: Buffer[] = []

	return new Promise<string>((resolve, reject) => {
		const encoder = lzma.createStream("rawEncoder", {
			synchronous: true,
			// @ts-ignore: Missing filter types
			filters: [{ id: lzma.FILTER_LZMA1 }]
		})

		encoder
			.on("data", (chunk: Buffer): void => {
				dataChunks.push(chunk)
			})
			.on("error", reject)
			.on("end", (): void => {
				const headerBysquare: Buffer = createBysquareHeader()
				const headerCompression: Buffer = createCompresionHeader(
					dataBuffer.byteLength
				)
				const mergeData = Buffer.concat([
					headerBysquare,
					headerCompression,
					...dataChunks
				])

				const output: string = alphanumericConversion(mergeData)
				resolve(output)
			})
			.write(dataBuffer, (error): void => {
				error && reject(error)
				encoder.end()
			})
	})
}