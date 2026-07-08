package main

import (
	"encoding/json"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io"
	"os"
	"strings"
)

type Declaration struct {
	Kind       string   `json:"kind"`
	SymbolName string   `json:"symbolName"`
	Receiver   string   `json:"receiver,omitempty"`
	Signature  string   `json:"signature,omitempty"`
	Body       string   `json:"body,omitempty"`
	BodyStart  int      `json:"bodyStart,omitempty"`
	BodyEnd    int      `json:"bodyEnd,omitempty"`
	StartLine  int      `json:"startLine"`
	EndLine    int      `json:"endLine"`
	Imports    []string `json:"imports,omitempty"`
}

func main() {
	source, err := io.ReadAll(os.Stdin)
	if err != nil {
		writeError(fmt.Sprintf("reading stdin: %v", err))
		return
	}

	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, "", source, parser.ParseComments)
	if err != nil {
		writeError(fmt.Sprintf("parsing Go source: %v", err))
		return
	}

	var decls []Declaration

	// Extract imports
	var imports []string
	for _, imp := range f.Imports {
		if imp.Path != nil {
			path := strings.Trim(imp.Path.Value, "\"")
			if imp.Name != nil {
				imports = append(imports, imp.Name.Name+" \""+path+"\"")
			} else {
				imports = append(imports, "\""+path+"\"")
			}
		}
	}
	if len(imports) > 0 {
		decls = append(decls, Declaration{
			Kind:      "imports",
			Imports:   imports,
			StartLine: fset.Position(f.Package).Line,
		})
	}

	// Extract top-level declarations
	for _, decl := range f.Decls {
		switch d := decl.(type) {
		case *ast.GenDecl:
			for _, spec := range d.Specs {
				switch s := spec.(type) {
				case *ast.TypeSpec:
					start := fset.Position(d.Pos())
					end := fset.Position(d.End())
					sig := sourceBetween(source, d.Pos(), d.End(), fset)
					bodyStart := 0
					bodyEnd := 0
					var body string
					if st, ok := s.Type.(*ast.StructType); ok && st.Fields != nil && st.Fields.List != nil {
						bodyStart = fset.Position(st.Fields.Opening).Line
						bodyEnd = fset.Position(st.Fields.Closing).Line
						bodyOff := fset.Position(st.Fields.Opening).Offset + 1
						bodyEndOff := fset.Position(st.Fields.Closing).Offset
						if bodyOff >= 0 && bodyEndOff <= len(source) && bodyOff < bodyEndOff {
							body = string(source[bodyOff:bodyEndOff])
						}
					}
					if it, ok := s.Type.(*ast.InterfaceType); ok && it.Methods != nil && it.Methods.List != nil {
						bodyStart = fset.Position(it.Methods.Opening).Line
						bodyEnd = fset.Position(it.Methods.Closing).Line
						bodyOff := fset.Position(it.Methods.Opening).Offset + 1
						bodyEndOff := fset.Position(it.Methods.Closing).Offset
						if bodyOff >= 0 && bodyEndOff <= len(source) && bodyOff < bodyEndOff {
							body = string(source[bodyOff:bodyEndOff])
						}
					}
					decls = append(decls, Declaration{
						Kind:       typeKind(s),
						SymbolName: s.Name.Name,
						Signature:  sig,
						Body:       body,
						BodyStart:  bodyStart,
						BodyEnd:    bodyEnd,
						StartLine:  start.Line,
						EndLine:    end.Line,
					})
				case *ast.ValueSpec:
					start := fset.Position(d.Pos())
					end := fset.Position(d.End())
					sig := sourceBetween(source, d.Pos(), d.End(), fset)
					for _, name := range s.Names {
						kind := "var"
						if d.Tok.String() == "const" {
							kind = "const"
						}
						decls = append(decls, Declaration{
							Kind:       kind,
							SymbolName: name.Name,
							Signature:  sig,
							StartLine:  start.Line,
							EndLine:    end.Line,
						})
					}
				}
			}
		case *ast.FuncDecl:
			start := fset.Position(d.Pos())
			end := fset.Position(d.End())
			kind := "function"
			var receiver string
			symbolName := d.Name.Name
			if d.Recv != nil && len(d.Recv.List) > 0 {
				kind = "method"
				recvType := exprString(d.Recv.List[0].Type)
				recvName := ""
				if len(d.Recv.List[0].Names) > 0 {
					recvName = d.Recv.List[0].Names[0].Name + " "
				}
				receiver = recvName + recvType
				recvBase := strings.TrimLeft(recvType, "*")
				if idx := strings.IndexAny(recvBase, "["); idx >= 0 {
					recvBase = recvBase[:idx]
				}
				symbolName = recvBase + "." + d.Name.Name
			}
			var sig string
			var body string
			bodyStart := 0
			bodyEnd := 0
			if d.Body != nil {
				sig = sourceBetween(source, d.Pos(), d.Type.End(), fset)
				bodyStart = fset.Position(d.Body.Lbrace).Line
				bodyEnd = fset.Position(d.Body.Rbrace).Line
				bodyOff := fset.Position(d.Body.Lbrace).Offset + 1
				bodyEndOff := fset.Position(d.Body.Rbrace).Offset
				if bodyOff >= 0 && bodyEndOff <= len(source) && bodyOff < bodyEndOff {
					body = string(source[bodyOff:bodyEndOff])
				}
			} else {
				sig = sourceBetween(source, d.Pos(), d.End(), fset)
			}
			decls = append(decls, Declaration{
				Kind:       kind,
				SymbolName: symbolName,
				Receiver:   receiver,
				Signature:  sig,
				Body:       body,
				BodyStart:  bodyStart,
				BodyEnd:    bodyEnd,
				StartLine:  start.Line,
				EndLine:    end.Line,
			})
		}
	}

	out, err := json.Marshal(decls)
	if err != nil {
		writeError(fmt.Sprintf("marshaling JSON: %v", err))
		return
	}
	fmt.Println(string(out))
}

func typeKind(s *ast.TypeSpec) string {
	switch s.Type.(type) {
	case *ast.StructType:
		return "struct"
	case *ast.InterfaceType:
		return "interface"
	default:
		return "type"
	}
}

func exprString(expr ast.Expr) string {
	switch e := expr.(type) {
	case *ast.StarExpr:
		return "*" + exprString(e.X)
	case *ast.Ident:
		return e.Name
	case *ast.SelectorExpr:
		return exprString(e.X) + "." + e.Sel.Name
	case *ast.ArrayType:
		return "[]" + exprString(e.Elt)
	case *ast.IndexExpr:
		return exprString(e.X) + "[" + exprString(e.Index) + "]"
	case *ast.IndexListExpr:
		args := make([]string, len(e.Indices))
		for i, idx := range e.Indices {
			args[i] = exprString(idx)
		}
		return exprString(e.X) + "[" + strings.Join(args, ", ") + "]"
	default:
		return fmt.Sprintf("%T", e)
	}
}

func sourceBetween(source []byte, start, end token.Pos, fset *token.FileSet) string {
	s := fset.Position(start).Offset
	e := fset.Position(end).Offset
	if s >= 0 && e <= len(source) && s < e {
		return string(source[s:e])
	}
	return ""
}

func writeError(msg string) {
	out, _ := json.Marshal(map[string]string{"error": msg})
	fmt.Println(string(out))
}
