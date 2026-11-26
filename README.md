# Malodge-Club-Villa

## Suivi des extras

Module « Suivi des extras » (menu *Pilotage*) : saisie des extras par séjour, règlements avec validation,
comptes clients / prestataires / propriétaires / salariés, catalogue avec coût d'achat et réglages des taux.
Les propriétaires (rôle `OWNER`), salariés (`EMPLOYEE`), prestataires et clients consultent leur compte
dans *Mon compte*.

Importer le fichier Excel de suivi (une seule fois ; `--dry-run` pour vérifier la lecture, `--force` pour réimporter) :

```bash
cd apps/backend
DATABASE_URL=… npm run import:extras -- "/chemin/Suivi_extras.xlsx" --dry-run
DATABASE_URL=… npm run import:extras -- "/chemin/Suivi_extras.xlsx"
```
