import * as lzma from "lzma-native"
import { expect, test } from "vitest"

import { Model, generate } from "./"
import {
	createBysquareHeader,
	createChecksum,
	createTabbedString,
	dataWithChecksum
} from "./generate"
import { createModel } from "./parse"

const model: Model = {
	IBAN: "SK9611000000002918599669",
	Amount: 100.0,
	CurrencyCode: "EUR",
	VariableSymbol: "123",
	Payments: 1,
	PaymentOptions: 1,
	BankAccounts: 1
}

// prettier-ignore
const tabbedString = [
    "\t", "1",
    "\t", "1",
    "\t", "1", "0", "0",
    "\t", "E", "U", "R",
    "\t",
    "\t", "1", "2", "3",
    "\t", "\t", "\t", "\t",
    "\t", "1",
    "\t", "S", "K", "9", "6", "1", "1", "0", "0", "0", "0", "0", "0", "0", "0", "2", "9", "1", "8", "5", "9", "9", "6", "6", "9",
    "\t", "\t", "\t", "\t", "\t", "\t", "\t", "\t", "\t", "\t", "\t", "\t", "\t", "\t", "\t", "\t", "\t", "\t", "\t", "\t"
].join("")

test("Generate query-string from model", async () => {
	const generatedQrString = await generate(model)
	expect(generatedQrString).toEqual(
		"0004G0005ES17OQ09C98Q7ME34TCR3V71LVKD2AE6EGHKR82DKS5NBJ3331VUFQIV0JGMR743UJCKSAKEM9QGVVVOIVH000"
	)
})

test("Create tabbed string from model", () => {
	const expected = createTabbedString(model)
	expect(tabbedString).toBe(expected)
})

test("Create checksum", () => {
	const expected: Buffer = Buffer.from([0x57, 0xe0, 0xbf, 0x34])
	const checksum: Buffer = createChecksum(tabbedString)

	expect(checksum).toStrictEqual(expected)
})

test("Create data with checksum", () => {
	const checksum = dataWithChecksum(model)
	const expected = Buffer.from(
		"57e0bf34093109310931303009455552090931323309090909093109534b393631313030303030303030323931383539393636390909090909090909090909090909090909090909",
		"hex"
	)

	expect(checksum).toStrictEqual(expected)
})

test("Create model from tabbed string", () => {
	const expected = createModel(tabbedString)
	expect(model).toStrictEqual(expected)
})

test("Create binary header, default", () => {
	const created = createBysquareHeader()
	const expected = Buffer.from([0x0, 0x0])

	expect(created).toStrictEqual(expected)
})

test("Create binary header, args", () => {
	// prettier-ignore
	const created: Buffer = createBysquareHeader([
		0b0000_0001, 0b0000_0010,
		0b0000_0011, 0b0000_0100
	])

	// prettier-ignore
	const expected: Buffer = Buffer.from([
		0b0001_0010,
		0b0011_0100
	])

	expect(created).toEqual(expected)
})

test("Lzma testing", () => {
	const encoder = lzma.createStream("rawEncoder", {
		synchronous: true,
		// @ts-ignore: Missing filter types
		filters: [{ id: lzma.FILTER_LZMA1 }]
	})

	const message = "Hello"
	const compress = Buffer.from(message, "utf-8")
	const dataChunks: Buffer[] = []

	encoder
		.on("data", (data: Buffer): void => {
			dataChunks.push(data)
		})
		.on("end", (): void => {
			// console.log(dataChunks);

			// @ts-ignore: Missing decored types
			const decoder = lzma.createStream("rawDecoder", {
				synchronous: true,
				// @ts-ignore: Missing filter types
				filters: [{ id: lzma.FILTER_LZMA1 }]
			})

			decoder
				.on("data", (res: Buffer): void => {
					const decoded = res.toString("utf-8")
					expect(decoded).toBe(message)
				})
				.write(Buffer.concat(dataChunks), (error): void => {
					decoder.end()
				})
		})
		.write(compress, (error): void => {
			encoder.end()
		})
})