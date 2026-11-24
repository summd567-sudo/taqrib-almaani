# Local OCR of rendered book pages with the built-in Windows OCR engine (ar-SA).
# Usage: powershell -File tools/ocr.ps1 -InDir <png_dir> -OutDir <txt_dir>
# Render the pages first, e.g.: pdftoppm -scale-to 2600 -gray -png book.pdf <png_dir>/p
param($InDir, $OutDir, [int]$MinAgeSec = 0)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[void][Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
[void][Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
[void][Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics,ContentType=WindowsRuntime]
[void][Windows.Globalization.Language,Windows.Globalization,ContentType=WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
$lang = New-Object Windows.Globalization.Language 'ar-SA'
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
Get-ChildItem $InDir -Filter *.png | Where-Object { $_.LastWriteTime -lt (Get-Date).AddSeconds(-$MinAgeSec) } | Sort-Object Name | ForEach-Object {
  $out = Join-Path $OutDir ($_.BaseName + '.txt')
  if (Test-Path $out) { return }
  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($_.FullName)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $dec = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bmp = Await ($dec.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $res = Await ($engine.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
  $text = ($res.Lines | ForEach-Object { $_.Text }) -join "`n"
  [IO.File]::WriteAllText($out, $text, (New-Object Text.UTF8Encoding $false))
  $stream.Dispose()
}
'done'
