import { Project, SyntaxKind } from 'ts-morph';
import fs from 'fs';

const project = new Project();
const sourceFile = project.addSourceFileAtPath('lib/i18n.ts');

const enObject = sourceFile.getVariableDeclaration('en')?.getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
const enProperties = enObject.getProperties();

const enDict = {};
enProperties.forEach(p => {
    if (p.isKind(SyntaxKind.PropertyAssignment)) {
        enDict[p.getName()] = p.getInitializer()?.getText().replace(/^'|'$/g, '').replace(/\\'/g, "'");
    }
});

const dictVar = sourceFile.getVariableDeclaration('dict')?.getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
const dictProps = dictVar.getProperties();

let missingStats = {};

dictProps.forEach(langProp => {
    if (langProp.isKind(SyntaxKind.PropertyAssignment)) {
        const lang = langProp.getName();
        if (lang === 'en' || lang === 'fr') return;
        
        const langObj = langProp.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
        if (!langObj) return;

        const langDict = {};
        langObj.getProperties().forEach(p => {
            if (p.isKind(SyntaxKind.PropertyAssignment)) {
                langDict[p.getName()] = p.getInitializer()?.getText().replace(/^'|'$/g, '').replace(/\\'/g, "'");
            }
        });

        let missingCount = 0;
        let leftoverCount = 0;
        for (const key of Object.keys(enDict)) {
            if (!langDict[key]) {
                missingCount++;
            } else if (
                langDict[key] === enDict[key] && !['BETA', 'testnet', 'mainnet'].includes(enDict[key])
            ) {
                leftoverCount++;
            }
        }
        missingStats[lang] = { missingCount, leftoverCount };
    }
});

console.log(JSON.stringify(missingStats, null, 2));
