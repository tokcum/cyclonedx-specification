"use strict";

import {readFile} from 'fs/promises'
import {dirname, basename, join} from 'path'
import {fileURLToPath} from 'url'

import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import addFormats2019 from 'ajv-formats-draft2019'
import {glob} from 'glob'


const __dirname = dirname(fileURLToPath(import.meta.url))
const schemaDir = join(__dirname, '..', '..', '..', '..', 'schema')

const [spdxSchema, jsfSchema] = await Promise.all([
    readFile(join(schemaDir, 'spdx.schema.json'), 'utf-8').then(JSON.parse),
    readFile(join(schemaDir, 'jsf-0.82.schema.json'), 'utf-8').then(JSON.parse)
])
const bomSchemas = (await glob(join(schemaDir, 'bom-*.schema.json'))).sort()

/**
 * @return {Ajv}
 */
function getAjv() {
    const ajv = new Ajv({
        // no defaults => no data alteration
        useDefaults: false,
        strict: true,
        strictSchema: true,
        addUsedSchema: false,
        schemas: {
            'http://cyclonedx.org/schema/spdx.schema.json': spdxSchema,
            'http://cyclonedx.org/schema/jsf-0.82.schema.json': jsfSchema
        }
    });
    addFormats(ajv)
    addFormats2019(ajv, {formats: ['idn-email']})
    // there is just no working implementation for format "iri-reference": see https://github.com/luzlab/ajv-formats-draft2019/issues/22
    ajv.addFormat('iri-reference', true)
    return ajv
}

let errCnt = 0

for (const bomSchemaFile of bomSchemas) {
    console.log('\nSchemaFile: ', bomSchemaFile);
    const v = /^bom-(\d)\.(\d)/.exec(basename(bomSchemaFile)) ?? []
    if (!v[0]) {
        // test match failed
        console.log('Skipped.')
        continue
    }
    if (([Number(v[1]), Number(v[2])] < [1, 5])) {
        // versions < 1.5 are not expected to pass these tests
        console.log('Skipped.')
        continue
    }

    let bomSchema
    try {
        bomSchema = await readFile(bomSchemaFile, 'utf-8').then(JSON.parse)
    } catch (err) {
        ++errCnt
        console.error('JSON DECODE ERROR:', err)
        continue
    }

    try {
        getAjv().compile(bomSchema)
    } catch (err) {
        ++errCnt
        console.error(`SCHEMA ERROR: ${err}`)
        continue
    }

    console.log('OK.')
}

// Exit statuses should be in the range 0 to 254.
// The status 0 is used to terminate the program successfully.
process.exitCode = Math.min(errCnt, 254)