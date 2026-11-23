Add-Type -AssemblyName System.IO.Compression.FileSystem

$xlsxPath = "C:\Proyectos\Automatizaciones GCO\automatizaciones\Directorio y Registro de Interacciones GCO (2).xlsx"
$outPath = "C:\Proyectos\Automatizaciones GCO\gco-panel\src\data\gco-seed.json"

$zip = [System.IO.Compression.ZipFile]::OpenRead($xlsxPath)

function Read-XmlEntry($zip, $name) {
    $e = $zip.GetEntry($name)
    if (-not $e) { return $null }
    $r = New-Object System.IO.StreamReader($e.Open(), [System.Text.Encoding]::UTF8)
    $txt = $r.ReadToEnd()
    $r.Close()
    return [xml]$txt
}

# Shared strings
$ssXml = Read-XmlEntry $zip "xl/sharedStrings.xml"
$shared = New-Object System.Collections.Generic.List[string]
if ($ssXml) {
    foreach ($si in $ssXml.sst.si) {
        if ($null -ne $si.t) {
            if ($si.t -is [string]) { $shared.Add($si.t) }
            else { $shared.Add($si.t.InnerText) }
        } elseif ($null -ne $si.r) {
            $sb = New-Object System.Text.StringBuilder
            foreach ($run in $si.r) {
                if ($run.t -is [string]) { [void]$sb.Append($run.t) }
                elseif ($null -ne $run.t) { [void]$sb.Append($run.t.InnerText) }
            }
            $shared.Add($sb.ToString())
        } else {
            $shared.Add("")
        }
    }
}

$wbXml = Read-XmlEntry $zip "xl/workbook.xml"
$relsXml = Read-XmlEntry $zip "xl/_rels/workbook.xml.rels"
$relMap = @{}
foreach ($rel in $relsXml.Relationships.Relationship) {
    $relMap[$rel.Id] = $rel.Target
}

function ColLettersToIndex([string]$cellRef) {
    $letters = ($cellRef -replace "\d+", "").ToUpper()
    $idx = 0
    for ($i = 0; $i -lt $letters.Length; $i++) {
        $idx = $idx * 26 + ([int][char]$letters[$i] - [int][char]'A' + 1)
    }
    return $idx - 1
}

function Read-SheetMatrix($sheetName) {
    $sheetNode = $wbXml.workbook.sheets.sheet | Where-Object { $_.name -eq $sheetName } | Select-Object -First 1
    if (-not $sheetNode) { return @() }
    $rId = $sheetNode.GetAttribute("id", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")
    $target = "xl/" + ($relMap[$rId] -replace "^/", "")
    $shXml = Read-XmlEntry $zip $target
    if (-not $shXml -or -not $shXml.worksheet.sheetData.row) { return @() }

    $result = New-Object System.Collections.Generic.List[object]
    foreach ($row in $shXml.worksheet.sheetData.row) {
        $arr = New-Object string[] 22
        for ($k = 0; $k -lt 22; $k++) { $arr[$k] = "" }
        foreach ($c in $row.c) {
            $colIdx = ColLettersToIndex $c.r
            if ($colIdx -ge 22) { continue }
            $v = ""
            if ($c.t -eq "s" -and $c.v) {
                $siIdx = [int]$c.v
                if ($siIdx -ge 0 -and $siIdx -lt $shared.Count) { $v = $shared[$siIdx] }
            } elseif ($c.t -eq "inlineStr" -and $c.is.t) {
                $v = [string]$c.is.t
            } elseif ($null -ne $c.v) {
                $v = [string]$c.v
            }
            $arr[$colIdx] = $v.Trim()
        }
        $result.Add($arr)
    }
    return $result
}

function Parse-CLP([string]$val) {
    if ([string]::IsNullOrWhiteSpace($val)) { return 0 }
    # Handle scientific or decimal Excel numbers like 1.9083162E7 or 125057.0
    if ($val -match "^-?\d+(\.\d+)?([eE][+-]?\d+)?$") {
        return [int64][Math]::Round([double]$val)
    }
    $clean = $val -replace "[^\d\-]", ""
    if ([string]::IsNullOrWhiteSpace($clean) -or $clean -eq "-") { return 0 }
    return [int64]$clean
}

function Parse-ExcelDate([string]$val) {
    if ([string]::IsNullOrWhiteSpace($val)) { return "" }
    if ($val -match "^\d{4}-\d{2}-\d{2}") { return $val.Substring(0, 10) }
    if ($val -match "^(\d{1,2})[\-/](\d{1,2})[\-/](\d{2,4})") {
        $d = [int]$Matches[1]; $m = [int]$Matches[2]; $y = [int]$Matches[3]
        if ($y -lt 100) { $y += 2000 }
        try { return (Get-Date -Year $y -Month $m -Day $d).ToString("yyyy-MM-dd") } catch { return $val }
    }
    if ($val -match "^\d{5}(\.\d+)?$") {
        $serial = [double]$val
        if ($serial -gt 35000 -and $serial -lt 60000) {
            $base = Get-Date -Year 1899 -Month 12 -Day 30
            return $base.AddDays([Math]::Floor($serial)).ToString("yyyy-MM-dd")
        }
    }
    return $val
}

function Normalize-Community([string]$raw) {
    if ([string]::IsNullOrWhiteSpace($raw)) { return "" }
    $u = $raw.ToUpperInvariant()
    if ($u -match "PINTO") { return "Aníbal Pinto" }
    if ($u -match "MONTEMARE|MONTEMAR") { return "Montemare" }
    if ($u -match "COSTANERA") { return "Centro Costanera" }
    return ""
}

function Normalize-Unit([string]$com, [string]$raw, [string]$torre = "") {
    $s = ([string]$raw).Trim()
    if ([string]::IsNullOrWhiteSpace($s)) { return "" }
    # Remove trailing .0 from Excel numbers
    if ($s -match "^(\d+)\.0+$") { $s = $Matches[1] }
    $sUp = $s.ToUpperInvariant()
    if ($sUp -match "INMOBILIARIA") { return $s }
    if ($com -eq "Aníbal Pinto") {
        $t = ([string]$torre).ToUpperInvariant() -replace "TORRE", ""
        $t = $t.Trim()
        if ($s -match "^([AB])\s*(\d+)") {
            return "$($Matches[1].ToUpper()) $($Matches[2])"
        }
        if ($s -match "(\d+)\s*[- ]*([AB])$") {
            return "$($Matches[2].ToUpper()) $($Matches[1])"
        }
        if ($s -match "(\d+)") {
            if ($t -eq "A" -or $t -eq "B") { return "$t $($Matches[1])" }
            return $Matches[1]
        }
    } else {
        if ($s -match "(\d+)") { return $Matches[1] }
    }
    return $s
}

Write-Host "1. Reading Directorio de Contactos..."
$dirMap = @{}
$dirRows = Read-SheetMatrix "Directorio de Contactos"
foreach ($r in $dirRows) {
    $com = Normalize-Community $r[3]
    if (-not $com) { continue }
    $u = Normalize-Unit $com $r[4] $r[5]
    if (-not $u) { continue }
    $key = "$com|$u"
    $emails = @()
    if ($r[7] -and $r[7] -notmatch "Sin correo|no registrado") {
        $emails = ($r[7] -replace ";", ",") -split "," | ForEach-Object { $_.Trim().ToLower() } | Where-Object { $_ -match "@" }
    }
    $phones = @()
    if ($r[11]) {
        $pRaw = $r[11]
        if ($pRaw -match "^(\d+(\.\d+)?[eE][+-]?\d+)$") {
            $pRaw = ([int64][double]$pRaw).ToString()
        }
        $phones = $pRaw -split "[/,;]" | ForEach-Object { ($_ -replace "[^\d\+]", "").Trim() } | Where-Object { $_.Length -ge 8 }
    }
    if (-not $dirMap.ContainsKey($key)) {
        $dirMap[$key] = @{
            nombre = $r[2]
            rut = $r[9]
            emails = @($emails)
            phones = @($phones)
            estadoCF = $r[8]
            ultimaInteraccion = $r[6]
            pagadorHabitual = $r[10]
        }
    }
}

Write-Host "2. Reading CF_Import_Morosidad..."
$moraMap = @{}
$moraRows = Read-SheetMatrix "CF_Import_Morosidad"
for ($i = 1; $i -lt $moraRows.Count; $i++) {
    $r = $moraRows[$i]
    $com = Normalize-Community $r[0]
    if (-not $com) { continue }
    $u = Normalize-Unit $com $r[1] $r[2]
    if (-not $u) { continue }
    $key = "$com|$u"
    $moraMap[$key] = @{
        deudaCapital = Parse-CLP $r[4]
        intereses = Parse-CLP $r[5]
        deudaTotal = Parse-CLP $r[6]
        mesesAtraso = [int](Parse-CLP $r[7])
        fechaVencimiento = Parse-ExcelDate $r[8]
        corteHabilitado = ($r[3] -match "CORTE HABILITADO") -or ((Parse-CLP $r[7]) -ge 3)
        correoMora = $r[9]
    }
}

Write-Host "3. Reading SCORING_PAGADORES_GCO..."
$scoringMap = @{}
$scRows = Read-SheetMatrix "SCORING_PAGADORES_GCO"
$scStart = 0
for ($i = 0; $i -lt [Math]::Min(10, $scRows.Count); $i++) {
    if ($scRows[$i][0] -eq "EDIFICIO" -and $scRows[$i][1] -eq "UNIDAD") { $scStart = $i + 1; break }
}
for ($i = $scStart; $i -lt $scRows.Count; $i++) {
    $r = $scRows[$i]
    $com = Normalize-Community $r[0]
    if (-not $com) { continue }
    $u = Normalize-Unit $com $r[1]
    if (-not $u) { continue }
    $scoringMap["$com|$u"] = @{
        perfil = $r[3]
        pagosConciliados = [int](Parse-CLP $r[4])
        diaPromedio = $r[5]
        estrategia = $r[8]
    }
}

Write-Host "4. Reading CF_Anibal_Pinto & CF_Montemare..."
$unitsList = New-Object System.Collections.Generic.List[object]

$cfConfigs = @(
    @{ com = "Aníbal Pinto"; sheet = "CF_Anibal_Pinto"; diaVenc = 25 },
    @{ com = "Montemare"; sheet = "CF_Montemare"; diaVenc = 15 }
)

foreach ($cfg in $cfConfigs) {
    $rows = Read-SheetMatrix $cfg.sheet
    $headerIdx = -1
    for ($i = 0; $i -lt [Math]::Min(15, $rows.Count); $i++) {
        if ($rows[$i][1] -match "Unidad" -or $rows[$i][0] -match "Unidad") { $headerIdx = $i; break }
    }
    if ($headerIdx -lt 0) { continue }
    $offset = if ($rows[$headerIdx][1] -match "Unidad") { 1 } else { 0 }

    for ($i = $headerIdx + 1; $i -lt $rows.Count; $i++) {
        $r = $rows[$i]
        $uRaw = $r[$offset]
        if ([string]::IsNullOrWhiteSpace($uRaw) -or $uRaw -match "Total|TOTAL") { continue }
        $uStd = Normalize-Unit $cfg.com $uRaw
        if (-not $uStd) { continue }

        $key = "$($cfg.com)|$uStd"
        $dir = $dirMap[$key]
        $mora = $moraMap[$key]
        $sc = $scoringMap[$key]

        $torre = ""
        $numero = 0
        if ($uStd -match "^([AB])\s+(\d+)") {
            $torre = $Matches[1]
            $numero = [int]$Matches[2]
        } elseif ($uStd -match "(\d+)") {
            $torre = if ($cfg.com -eq "Montemare") { "Única" } else { "A" }
            $numero = [int]$Matches[1]
        }
        $piso = if ($numero -ge 100) { [Math]::Floor($numero / 100) } else { 0 }

        $cobro = Parse-CLP $r[$offset + 2]
        $abonos = Parse-CLP $r[$offset + 3]
        $pagado = Parse-CLP $r[$offset + 4]
        $ajustes = Parse-CLP $r[$offset + 5]
        $convenios = Parse-CLP $r[$offset + 6]
        $saldoPend = Parse-CLP $r[$offset + 8]
        $saldoFavor = Parse-CLP $r[$offset + 9]
        $estadoCF = $r[$offset + 10]
        $fechaUltPago = Parse-ExcelDate $r[$offset + 11]
        $folioUltPago = ($r[$offset + 12] -replace "\.0+$", "")
        $formaPago = $r[$offset + 13]
        $montoUltPago = Parse-CLP $r[$offset + 14]

        $deudaVencida = if ($mora) { $mora.deudaTotal } else { 0 }
        $mesesAtraso = if ($mora) { $mora.mesesAtraso } else { 0 }
        $corte = if ($mora) { [bool]$mora.corteHabilitado } else { $false }

        $estadoPago = "AL_DIA"
        if ($corte -or $mesesAtraso -ge 3) { $estadoPago = "CORTE" }
        elseif ($mesesAtraso -eq 2) { $estadoPago = "MORA_2M" }
        elseif ($mesesAtraso -eq 1 -and $deudaVencida -ge 5000) { $estadoPago = "MORA_1M" }
        elseif ($saldoPend -gt 10 -and $pagado -gt 0) { $estadoPago = "PARCIAL" }
        elseif ($saldoPend -gt 10) { $estadoPago = "PENDIENTE" }

        $unitsList.Add([ordered]@{
            id = $key
            comunidad = $cfg.com
            unidad = $uStd
            torre = $torre
            piso = [int]$piso
            numero = [int]$numero
            residente = $r[$offset + 1]
            rut = if ($dir -and $dir.rut) { $dir.rut } else { "" }
            emails = if ($dir) { $dir.emails } else { @() }
            phones = if ($dir) { $dir.phones } else { @() }
            estadoDirectorioCF = if ($dir) { $dir.estadoCF } else { "" }
            pagadorHabitual = if ($dir) { $dir.pagadorHabitual } else { "" }
            cobroMes = $cobro
            abonos = $abonos
            pagadoMes = $pagado
            ajustes = $ajustes
            convenioMonto = $convenios
            saldoPendiente = $saldoPend
            saldoFavor = $saldoFavor
            estadoCF = $estadoCF
            fechaUltimoPago = $fechaUltPago
            folioUltimoPago = $folioUltPago
            formaPago = $formaPago
            montoUltimoPago = $montoUltPago
            deudaVencida = $deudaVencida
            deudaCapital = if ($mora) { $mora.deudaCapital } else { 0 }
            intereses = if ($mora) { $mora.intereses } else { 0 }
            mesesAtraso = $mesesAtraso
            fechaVencimiento = if ($mora) { $mora.fechaVencimiento } else { "" }
            corteHabilitado = $corte
            estadoPago = $estadoPago
            scoringPerfil = if ($sc) { $sc.perfil } else { "Sin historial" }
            scoringPagos = if ($sc) { $sc.pagosConciliados } else { 0 }
            scoringDiaPromedio = if ($sc) { $sc.diaPromedio } else { "Sin historial aún" }
        })
    }
}

Write-Host "5. Reading Cartola_Anibal_Pinto & Cartola_Montemare..."
$bankMovements = New-Object System.Collections.Generic.List[object]
$cartolaSummary = @{}

$cartolaConfigs = @(
    @{ com = "Aníbal Pinto"; sheet = "Cartola_Anibal_Pinto"; banco = "Banco de Chile"; cuenta = "00-593-02699-03"; rut = "53.323.838-6" },
    @{ com = "Montemare"; sheet = "Cartola_Montemare"; banco = "Scotiabank Chile"; cuenta = "988849855"; rut = "" }
)

foreach ($cc in $cartolaConfigs) {
    $rows = Read-SheetMatrix $cc.sheet
    $summaryRow = if ($rows.Count -ge 3) { $rows[2] } else { @("", "", "", "", "", "", "", "", "", "", "") }
    $pctStr = $summaryRow[8]
    $pctNum = 0.0
    if ($pctStr -match "^\d+(\.\d+)?$") {
        $d = [double]$pctStr
        $pctNum = if ($d -le 1.0) { [Math]::Round($d * 100, 1) } else { [Math]::Round($d, 1) }
    }
    $cartolaSummary[$cc.com] = [ordered]@{
        banco = $cc.banco
        cuenta = $cc.cuenta
        rut = $cc.rut
        totalAbonos = Parse-CLP $summaryRow[0]
        confirmadosTexto = $summaryRow[2]
        confirmadosMonto = Parse-CLP (($summaryRow[2] -split "\(")[0])
        historicosTexto = $summaryRow[4]
        porRevisarMonto = Parse-CLP $summaryRow[6]
        pctConciliado = $pctNum
        resumenConteo = $summaryRow[10]
    }

    $cartStart = 0
    for ($i = 0; $i -lt [Math]::Min(10, $rows.Count); $i++) {
        if ($rows[$i][0] -match "Fecha Abono") { $cartStart = $i + 1; break }
    }
    for ($i = $cartStart; $i -lt $rows.Count; $i++) {
        $r = $rows[$i]
        $monto = Parse-CLP $r[4]
        if ($monto -le 0) { continue }
        $fecha = Parse-ExcelDate $r[0]
        $uRaw = $r[5]
        $uStd = if ($uRaw -and $uRaw -notmatch "Sin identificar|Sin asignar|Abono Web|Vending") { Normalize-Unit $cc.com $uRaw } else { $uRaw }
        $estado = $r[10]
        $cat = "CONCILIADO"
        $eUp = $estado.ToUpperInvariant()
        if ($eUp -match "PASARELA|REMESA WEB") { $cat = "PASARELA" }
        elseif ($eUp -match "HISTÓRICO|HISTORICO|VENDING") { $cat = "HISTORICO" }
        elseif ($eUp -match "FALTA IMPUTAR") { $cat = "DIGITAR_CF" }
        elseif ($eUp -match "PROBABLE|VARIAS|REVISAR|DUPLICADO") { $cat = "APROBAR_DIC" }
        elseif ($eUp -match "HUÉRFANO|HUERFANO" -or -not $uStd -or $uStd -match "Sin identificar") { $cat = "HUERFANO" }

        $bankMovements.Add([ordered]@{
            id = "$($cc.com)-M$($i + 1)"
            comunidad = $cc.com
            fecha = $fecha
            glosa = $r[1]
            rutOp = $r[2]
            monto = $monto
            unidad = $uStd
            residenteCF = $r[6]
            metodo = $r[7]
            folioFechaCF = $r[8]
            montoCF = Parse-CLP $r[9]
            estado = $estado
            categoria = $cat
        })
    }
}

Write-Host "6. Reading PENDIENTES_CARTOLA_GCO..."
$pendientesList = New-Object System.Collections.Generic.List[object]
$pRows = Read-SheetMatrix "PENDIENTES_CARTOLA_GCO"
$pStart = 0
for ($i = 0; $i -lt [Math]::Min(10, $pRows.Count); $i++) {
    if ($pRows[$i][1] -match "PRIORIDAD") { $pStart = $i + 1; break }
}
for ($i = $pStart; $i -lt $pRows.Count; $i++) {
    $r = $pRows[$i]
    $com = Normalize-Community $r[2]
    $monto = Parse-CLP $r[6]
    if (-not $com -or $monto -le 0) { continue }
    $prio = "HUERFANO"
    if ($r[1] -match "DIGITAR") { $prio = "DIGITAR_CF" }
    elseif ($r[1] -match "APROBAR") { $prio = "APROBAR_DIC" }
    $pendientesList.Add([ordered]@{
        id = "PEND-$($i + 1)"
        prioridad = $prio
        prioridadLabel = $r[1]
        comunidad = $com
        fecha = Parse-ExcelDate $r[3]
        unidadSugerida = Normalize-Unit $com $r[4]
        unidadRaw = $r[4]
        residente = $r[5]
        monto = $monto
        glosa = $r[7]
        rutOp = $r[8]
        accionSugerida = $r[9]
        refInterna = $r[10]
        resuelto = $false
    })
}

Write-Host "7. Reading BANDEJA_PAGOS_GCO..."
$bandejaList = New-Object System.Collections.Generic.List[object]
$bRows = Read-SheetMatrix "BANDEJA_PAGOS_GCO"
$bStart = 0
for ($i = 0; $i -lt [Math]::Min(10, $bRows.Count); $i++) {
    if ($bRows[$i][0] -match "ID Registro") { $bStart = $i + 1; break }
}
for ($i = $bStart; $i -lt $bRows.Count; $i++) {
    $r = $bRows[$i]
    $com = Normalize-Community $r[2]
    $monto = Parse-CLP $r[8]
    if (-not $com -or $monto -le 0) { continue }
    $uStd = Normalize-Unit $com $r[6] $r[7]
    $st = $r[17]
    $catB = "EN_REVISION"
    if ($st -match "CONCILIADO") { $catB = "CONCILIADO" }
    elseif ($st -match "RECHAZADO|DUPLICADO") { $catB = "RECHAZADO" }
    $bandejaList.Add([ordered]@{
        id = if ($r[0]) { $r[0] } else { "BP-$($i + 1)" }
        fechaRecepcion = Parse-ExcelDate $r[1]
        comunidad = $com
        remitente = $r[3]
        pagador = $r[4]
        rutPagador = $r[5]
        unidad = $uStd
        monto = $monto
        fechaTransferencia = Parse-ExcelDate $r[9]
        banco = $r[10]
        folioCF = ($r[12] -replace "\.0+$", "")
        enlaceCorreo = $r[13]
        detalle = $r[14]
        estadoBanco = $r[15]
        estadoCF = $r[16]
        estadoGeneral = $st
        categoria = $catB
    })
}

Write-Host "8. Reading Diccionario Maestro..."
$dicList = New-Object System.Collections.Generic.List[object]
$dRows = Read-SheetMatrix "Diccionario Maestro"
for ($i = 1; $i -lt $dRows.Count; $i++) {
    $r = $dRows[$i]
    $com = Normalize-Community $r[0]
    if (-not $com) { continue }
    $uStd = Normalize-Unit $com $r[1]
    if (-not $uStd) { continue }
    $dicList.Add([ordered]@{
        id = "DIC-$($i + 1)"
        comunidad = $com
        unidad = $uStd
        residenteCF = $r[2]
        rut = $r[3]
        pagadorCartola = $r[4]
        pagosConciliados = [int](Parse-CLP $r[5])
        montoTotal = Parse-CLP $r[6]
        ultimoAbono = Parse-ExcelDate $r[7]
        estadoValidacion = $r[8]
        banco = $r[9]
        cuentaRut = $r[10]
    })
}

Write-Host "9. Reading CF_Import_Recaudacion..."
$recSummary = @{}
$recRows = Read-SheetMatrix "CF_Import_Recaudacion"
for ($i = 1; $i -lt $recRows.Count; $i++) {
    $r = $recRows[$i]
    $com = Normalize-Community $r[0]
    if (-not $com -or $recSummary.ContainsKey($com)) { continue }
    $recSummary[$com] = [ordered]@{
        periodo = Parse-ExcelDate $r[1]
        emitido = Parse-CLP $r[2]
        recaudado = Parse-CLP $r[3]
        egresos = Parse-CLP $r[4]
        fondoReserva = Parse-CLP $r[5]
        morosidad = Parse-CLP $r[7]
        criticas = [int](Parse-CLP $r[8])
    }
}

$zip.Dispose()

$payload = [ordered]@{
    generatedAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    sourceFile = "Directorio y Registro de Interacciones GCO (2).xlsx"
    periodoLabel = "Noviembre 2026"
    communities = @(
        [ordered]@{ id = "Aníbal Pinto"; nombre = "Edificio Aníbal Pinto"; diaVencimiento = 25; banco = "Banco de Chile"; cuenta = "00-593-02699-03"; rut = "53.323.838-6"; tieneCF = $true; tieneCartola = $true; torres = @("A", "B") },
        [ordered]@{ id = "Montemare"; nombre = "Comunidad Montemare"; diaVencimiento = 15; banco = "Scotiabank Chile"; cuenta = "988849855"; rut = ""; tieneCF = $true; tieneCartola = $true; torres = @("Única") },
        [ordered]@{ id = "Centro Costanera"; nombre = "Edificio Centro Costanera"; diaVencimiento = 10; banco = "Sin cartola automática"; cuenta = ""; rut = ""; tieneCF = $false; tieneCartola = $false; torres = @("Única") }
    )
    recaudacion = $recSummary
    cartolaSummary = $cartolaSummary
    units = $unitsList
    bankMovements = $bankMovements
    pendientes = $pendientesList
    bandeja = $bandejaList
    diccionario = $dicList
    convenios = @()
}

$json = $payload | ConvertTo-Json -Depth 6 -Compress
[System.IO.File]::WriteAllText($outPath, $json, [System.Text.Encoding]::UTF8)

Write-Host "EXPORT OK -> $outPath"
Write-Host ("Units: {0} | BankMovs: {1} | Pendientes: {2} | Bandeja: {3} | Diccionario: {4}" -f $unitsList.Count, $bankMovements.Count, $pendientesList.Count, $bandejaList.Count, $dicList.Count)
